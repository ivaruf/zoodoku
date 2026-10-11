/*
 * main.js — Zoodoku's flow: which screen, which puzzle, what gets saved.
 *
 * The shell (Lane C, DESIGN §4–5). It owns the screens — title, trail map,
 * free roam, play, win card — the menu panel, storage, and the corner's mute.
 * It does not own the board: the engine (js/engine.js, Lane A) makes puzzles,
 * the play surface (js/play.js, Lane B) is mounted into #play-root and runs
 * every tap and drag on it, and the art (js/animals.js, Lane D) draws the
 * animals. This file only joins them up, and js/ui.js draws what it decides.
 *
 * THE ONE RULE EVERYTHING HERE SERVES: a child's board in progress is never
 * lost. It is saved after every move (onChange → zoodoku.run.v1), stored with
 * the WHOLE puzzle rather than a seed, so a deploy that changes the generator
 * cannot swap it (hub §1), and the only ways to throw it away are an explicit
 * in-page "Leave it" or solving it. Leaving to the trail map, quitting to the
 * arcade, closing the tab — all of those keep it, and the title's first door
 * then reads "▶ Fortsett" / "▶ Resume".
 *
 * TWO LANGUAGES (js/i18n.js). Every word here goes through t(), and anything
 * worded at runtime is kept as a function — () => t(...) — wherever it has to
 * be asked for again: the play label, the win card, an open question, the
 * coach. The language row in the menu calls setLang(); `arcade:lang` then
 * lands in onLang() below, which repaints what is on screen in place. No
 * reload, no restart, no unpause — the menu stays open with focus where it was.
 *
 * ONE RUN AT A TIME. There is one run slot, so starting a different board
 * while one is saved asks first ("Leave your current puzzle?"). Tutorial
 * boards are never saved: they take a minute, and a half-done lesson is
 * better restarted than resumed.
 *
 * GETPUZZLE IS SLOW FOR 9×9 (a second or two in a worker) and the player may
 * back out while it runs, or tap a different stop. Every request takes a
 * ticket from `loadTicket`; an answer whose ticket is no longer current is
 * dropped on the floor. That is the whole of "cancel-safe": the engine is
 * deterministic and side-effect free, so an abandoned answer costs nothing
 * but the CPU it already spent.
 */

import { getPuzzle } from "./engine.js";
import { levelInfo, LEVEL_COUNT, TUTORIAL, FREE_TIERS } from "./levels.js";
import { mountPlay } from "./play.js";
import * as store from "./store.js";
import * as ui from "./ui.js";
import { t, setLang, paintStatic } from "./i18n.js";

const { $, REGION, regionName } = ui;

/* ================================================================ state */

let progress = store.loadProgress();
let settings = store.loadSettings();
/** The saved board in progress, as stored: { spec, puzzle, skin, play } | null */
let run = store.loadRun();
let muted = store.loadMuted();

/** The PlayHandle while a board is mounted, else null. */
let handle = null;
/** What is on the board now: { spec, puzzle, skin } (tutorial included). */
let current = null;
/** Ticket for the newest getPuzzle request; older answers are ignored. */
let loadTicket = 0;
/** Where "Back" from the hatching egg returns to. */
let cameFrom = "title";
/** Free roam's picker. Seeded from a saved free run so it remembers you. */
const free = { size: 4, tier: 0, skin: "animals" };
if (run && run.spec.kind === "free") {
  free.size = run.spec.size;
  free.tier = Math.min(run.spec.tier, (FREE_TIERS[run.spec.size] || 1) - 1);
  free.skin = run.skin;
}

/* ============================================================== helpers */

/** Every trail level's info, read once. levels.js is the only source. */
const LEVELS = [];
for (let l = 1; l <= LEVEL_COUNT; l++) LEVELS.push(levelInfo(l));

/** The first unsolved level after `from` (wrapping round), or null when the trail is done. */
function nextUnsolved(from = 0) {
  for (let k = 1; k <= LEVEL_COUNT; k++) {
    const l = ((from + k - 1) % LEVEL_COUNT) + 1;
    if (!progress.solved[l]) return l;
  }
  return null;
}

const sizeText = (size) => (REGION[size] ? REGION[size].size : `${size}×${size}`);

/**
 * "Nivå 12 · Engen 6×6" / "Fritt spill · 9×9 · 3 poter" — one wording
 * everywhere, in the current language. Free play is named by its size alone:
 * the region names are the trail's, and its picker says "Stort 9×9".
 */
function describe(spec, { long = true } = {}) {
  if (spec.kind === "trail") {
    const info = LEVELS[spec.level - 1];
    const size = info ? info.size : 4;
    return t("describeLevel", spec.level, regionName(size), long ? sizeText(size) : "");
  }
  if (spec.kind === "free") return t("describeFree", sizeText(spec.size), t("paws", spec.tier + 1));
  return t("describeTutorial", spec.index + 1, TUTORIAL.length);
}

function sameSpec(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "trail") return a.level === b.level;
  if (a.kind === "free") return a.size === b.size && a.tier === b.tier && a.n === b.n;
  return a.index === b.index;
}

/**
 * A one-line coach on the first board of a new size (DESIGN §1): the first
 * trail level of that size the player has not yet solved any of. Counted
 * from progress rather than from level numbers, so the note still appears for
 * a child who jumped straight to level 40.
 */
function coachFor(level) {
  const info = LEVELS[level - 1];
  if (!info || info.size === 4) return null;
  const anySolved = LEVELS.some((i) => i.size === info.size && progress.solved[i.level]);
  if (anySolved) return null;
  const key = info.size === 6 ? "coach.size6" : "coach.size9";
  return () => t(key);
}

/* ================================================================ title */

function paintTitle() {
  let primary;
  if (run) {
    primary = { main: t("door.resume"), sub: describe(run.spec) };
  } else {
    const n = nextUnsolved();
    primary = n
      ? { main: t("door.play"), sub: describe({ kind: "trail", level: n }) }
      : { main: t("door.play"), sub: t("door.allSolved") };
  }
  const newHere = !progress.tutorialDone && Object.keys(progress.solved).length === 0;
  ui.paintTitle({ primary, newHere });
}

function showTitle() {
  leaveBoard();
  paintTitle();
  ui.showScreen("title");
}

/* ============================================================ trail map */

function showTrail() {
  leaveBoard();
  renderTrail();
  ui.showScreen("trail");
}

function renderTrail(opts) {
  ui.renderTrail(
    {
      levels: LEVELS,
      solved: progress.solved,
      next: nextUnsolved(),
      runLevel: run && run.spec.kind === "trail" ? run.spec.level : null,
    },
    (level) => startPuzzle({ kind: "trail", level }),
    opts,
  );
}

/* ============================================================ free roam */

function paintFree() {
  ui.paintFree(free, FREE_TIERS[free.size] || 1, (tier) => {
    free.tier = tier;
    paintFree();
  });
}

function showFree() {
  leaveBoard();
  paintFree();
  ui.showScreen("free");
}

/** "New puzzle": the next n for this board and paw count, counted up in storage. */
async function newFreePuzzle() {
  if (!(await mayLeaveRun(null))) return;
  const key = `${free.size}-${free.tier}`;
  const n = (progress.freeN[key] || 0) + 1;
  progress.freeN[key] = n;
  store.saveProgress(progress);
  begin({ kind: "free", size: free.size, tier: free.tier, n }, "free");
}

/* ============================================================ the board */

/**
 * Ask before throwing away a saved run that is not the one being opened.
 * Resolves true when it is fine to go ahead (and has cleared the run).
 */
async function mayLeaveRun(spec) {
  if (!run || (spec && sameSpec(run.spec, spec))) return true;
  const waiting = run.spec;
  const ok = await ui.ask(() => ({
    text: t("ask.leave"),
    note: t("askLeaveNote", describe(waiting)),
    yes: t("ask.leaveYes"),
    no: t("ask.keep"),
  }));
  if (!ok) return false;
  store.clearRun();
  run = null;
  return true;
}

/** From the trail map: open a level, resuming it if it is the saved one. */
async function startPuzzle(spec) {
  if (run && sameSpec(run.spec, spec)) {
    resumeRun();
    return;
  }
  if (!(await mayLeaveRun(spec))) return;
  begin(spec, "trail");
}

/** Mount the saved run exactly as it was left. No engine call: the puzzle is in storage. */
function resumeRun() {
  if (!run) return;
  const spec = run.spec;
  ui.setPlayLabel(() => describe(spec, { long: false }));
  ui.setHatching(false);
  ui.showScreen("play");
  mount(run.spec, run.puzzle, run.skin, run.play, {});
}

/**
 * Ask the engine for a puzzle and mount it. The egg only appears if the
 * answer takes longer than a blink, so a 4×4 that arrives in 5 ms does not
 * flash an animation at the player.
 */
async function begin(spec, from) {
  leaveBoard();
  cameFrom = from;
  const ticket = ++loadTicket;
  ui.setPlayLabel(() => describe(spec, { long: false }));
  ui.setHatching(false);
  ui.showScreen("play");
  const eggTimer = setTimeout(() => {
    if (ticket === loadTicket) ui.setHatching(true);
  }, 150);
  let puzzle;
  try {
    puzzle = await getPuzzle(spec);
  } catch (err) {
    clearTimeout(eggTimer);
    if (ticket !== loadTicket) return;
    console.error("Zoodoku: getPuzzle failed", spec, err);
    ui.setHatching(true, true);
    return;
  }
  clearTimeout(eggTimer);
  if (ticket !== loadTicket) return; // backed out, or asked for another
  ui.setHatching(false);
  const skin = spec.kind === "trail" ? LEVELS[spec.level - 1].skin : free.skin;
  const extra = spec.kind === "trail" ? { coach: coachFor(spec.level), coachFades: true } : {};
  mount(spec, puzzle, skin, null, extra);
}

/** A tutorial board, built straight from the hand-made TUTORIAL table. */
function beginTutorial(index) {
  leaveBoard();
  loadTicket++;
  cameFrom = "title";
  const lesson = TUTORIAL[index];
  const puzzle = {
    id: `zoodoku-tutorial-${index + 1}`,
    size: lesson.size,
    box: { h: 2, w: 2 },
    givens: lesson.givens.slice(),
    solution: lesson.solution.slice(),
    tier: 0,
    notes: false,
  };
  ui.setPlayLabel(() => describe({ kind: "tutorial", index }), { tutorial: true });
  ui.setHatching(false);
  ui.showScreen("play");
  mount({ kind: "tutorial", index }, puzzle, "animals", null, {
    emphasis: lesson.rule || null,
    // The words come from js/i18n.js ("tut.coach.<index>"), not from the
    // English `coach` line in levels.js, which stays as the engine's record.
    coach: () => t(`tut.coach.${index}`),
  });
}

function mount(spec, puzzle, skin, saved, { emphasis = null, coach = null, coachFades = false }) {
  current = { spec, puzzle, skin };
  const opts = {
    puzzle,
    saved: saved || null,
    skin,
    settings: { ...settings },
    emphasis,
    coach,
    coachFades,
    onChange: (state) => persist(state),
    onSolved: () => solved(spec),
  };
  try {
    handle = mountPlay($("play-root"), opts);
  } catch (err) {
    // A saved board state the play surface no longer understands (an older
    // build's format, a hand-edited key) must not strand the child on a blank
    // screen: keep the puzzle, drop the moves, and say so in the console. A
    // failure with no saved state is a real bug and goes to the crash bar.
    if (!saved) throw err;
    console.warn("Zoodoku: saved board unreadable, starting it fresh", err);
    $("play-root").textContent = "";
    saved = null;
    handle = mountPlay($("play-root"), { ...opts, saved: null });
  }
  if (spec.kind !== "tutorial") {
    // Saved at once, not on the first move, so "Back to your puzzle" exists
    // the moment a board is on screen.
    run = { spec, puzzle, skin, play: saved || null };
    persist();
  }
}

/** Save the run. `state` is what onChange handed us; otherwise ask the handle. */
function persist(state) {
  if (!current || current.spec.kind === "tutorial" || !run) return;
  let play = state;
  if (play === undefined && handle) {
    try {
      play = handle.serialize();
    } catch {
      play = run.play;
    }
  }
  run.play = play === undefined ? null : play;
  run.skin = current.skin;
  store.saveRun(run);
}

/** Take the board down (the run stays saved). Safe to call with nothing mounted. */
function leaveBoard() {
  loadTicket++; // any puzzle still hatching is no longer wanted
  if (handle) {
    try {
      handle.destroy();
    } catch (err) {
      console.warn("Zoodoku: play destroy failed", err);
    }
  }
  handle = null;
  current = null;
  const root = $("play-root");
  if (root) root.textContent = "";
  ui.setHatching(false);
}

/* ============================================================== solving */

let winNext = null;
let winOther = null;

function solved(spec) {
  // onSolved for a board that is no longer the one mounted is stale.
  if (!current || !sameSpec(current.spec, spec)) return;
  const { puzzle, skin } = current;

  if (spec.kind === "tutorial") {
    const last = spec.index >= TUTORIAL.length - 1;
    if (last) {
      progress.tutorialDone = true;
      store.saveProgress(progress);
    }
    const i = spec.index;
    showWin({
      puzzle,
      skin,
      words: () => ({
        title: t(last ? "tut.done" : "tut.gotIt"),
        sub: i < TUTORIAL.length ? t(`tut.win.${i}`) : "",
        next: t(last ? "door.play" : "tut.next"),
        other: t(last ? "back" : "tut.skipRest"),
      }),
      onNext: () => (last ? followTrail() : beginTutorial(spec.index + 1)),
      onOther: () => {
        progress.tutorialDone = true;
        store.saveProgress(progress);
        showTitle();
      },
    });
    return;
  }

  store.clearRun();
  run = null;

  if (spec.kind === "trail") {
    progress.solved[spec.level] = true;
    store.saveProgress(progress);
    const next = nextUnsolved(spec.level);
    showWin({
      puzzle,
      skin,
      words: () => ({
        title: t(skin === "numbers" ? "win.numbers" : "win.animals"),
        sub: describe(spec),
        next: t(next ? "win.nextLevel" : "door.free"),
        other: t("door.levels"),
      }),
      onNext: () => (next ? begin({ kind: "trail", level: next }, "trail") : showFree()),
      onOther: showTrail,
    });
    return;
  }

  showWin({
    puzzle,
    skin,
    words: () => ({
      title: t(skin === "numbers" ? "win.numbers" : "win.animals"),
      sub: describe(spec),
      next: t("win.newBoard"),
      other: t("door.free"),
    }),
    onNext: newFreePuzzle,
    onOther: showFree,
  });
}

function showWin({ onNext, onOther, ...card }) {
  ui.renderWin(card);
  winNext = onNext;
  winOther = onOther;
  // The board is done with; the card carries its own copy of the solution.
  leaveBoard();
  ui.showScreen("win");
}

/** The title's first door when there is no run: straight to the next stop. */
function followTrail() {
  const n = nextUnsolved();
  if (n) begin({ kind: "trail", level: n }, "title");
  else showTrail();
}

/* ============================================================ the menu */

/*
 * One panel, two faces (maxgear's menuReturn). Opened over a mounted board it
 * is the pause: the board is paused, Resume is the way back. Anywhere else it
 * is settings and "Back" closes it where you stand. `pausedBoard` remembers
 * which face was painted, so closing resumes exactly what opening paused.
 */
let pausedBoard = false;

function openMenu() {
  if (ui.menuOpen()) return;
  pausedBoard = ui.screenNow() === "play" && !!handle;
  if (pausedBoard) {
    try {
      handle.pause();
    } catch {
      /* a board that cannot pause still gets a menu */
    }
  }
  paintMenu();
  ui.showMenu();
}

/** The menu's face from the state it was opened over; again on a language switch. */
function paintMenu() {
  const kind = current && current.spec.kind;
  ui.paintMenu({
    inPlay: pausedBoard,
    skin: current ? current.skin : "animals",
    conflicts: settings.conflicts,
    leaveLabel: kind === "free" ? "door.free" : kind === "tutorial" ? "menu.skip" : "door.levels",
  });
}

function closeMenu() {
  if (!ui.menuOpen()) return;
  ui.hideMenu();
  if (pausedBoard && handle) {
    try {
      handle.resume();
    } catch {
      /* nothing to resume */
    }
  }
  pausedBoard = false;
}

/* =============================================================== wiring */

function on(id, fn) {
  const el = $(id);
  if (el) el.addEventListener("click", fn);
}

// Title doors.
on("door-trail", () => (run ? resumeRun() : followTrail()));
on("door-map", showTrail);
on("door-free", showFree);
on("door-howto", () => beginTutorial(0));

// Trail map and free roam.
on("trail-back", showTitle);
on("free-back", showTitle);
on("free-go", newFreePuzzle);
$("free-size").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-size]");
  if (!b) return;
  free.size = Number(b.dataset.size);
  free.tier = Math.min(free.tier, (FREE_TIERS[free.size] || 1) - 1);
  paintFree();
});
$("free-skin").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-skin]");
  if (!b) return;
  free.skin = b.dataset.skin === "numbers" ? "numbers" : "animals";
  paintFree();
});

// Play.
on("hatching-back", () => {
  leaveBoard();
  if (cameFrom === "free") showFree();
  else if (cameFrom === "trail") showTrail();
  else showTitle();
});
on("tutorial-skip", () => {
  progress.tutorialDone = true;
  store.saveProgress(progress);
  showTitle();
});

// Win card.
on("win-next", () => winNext && winNext());
on("win-other", () => winOther && winOther());

// The corner. Clicks stop here so nothing underneath also sees them.
on("menu-open", (e) => {
  e.stopPropagation();
  if (ui.menuOpen()) closeMenu();
  else openMenu();
});
on("mute-toggle", (e) => {
  e.stopPropagation();
  setMuted(!muted);
});

// The menu panel.
on("menu-resume", closeMenu);
on("menu-close", closeMenu);
$("menu-scrim").addEventListener("click", closeMenu);
$("menu-skin").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-skin]");
  if (!b || !current || !handle) return;
  const skin = b.dataset.skin === "numbers" ? "numbers" : "animals";
  current.skin = skin;
  handle.setSkin(skin);
  ui.paintSkin(skin);
  persist();
});
$("menu-conflicts").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-on]");
  if (!b) return;
  settings.conflicts = b.dataset.on === "true";
  store.saveSettings(settings);
  ui.paintConflicts(settings.conflicts);
  if (handle) handle.setSettings({ ...settings });
});
on("menu-restart", async () => {
  if (!handle) return;
  const ok = await ui.ask(() => ({
    text: t("ask.restart"),
    note: t("ask.restartNote"),
    yes: t("ask.restartYes"),
    no: t("ask.restartNo"),
  }));
  if (!ok || !handle) return;
  handle.restart();
  persist();
  closeMenu();
});
on("menu-leave", () => {
  const kind = current && current.spec.kind;
  closeMenu();
  if (kind === "free") showFree();
  else if (kind === "tutorial") {
    progress.tutorialDone = true;
    store.saveProgress(progress);
    showTitle();
  } else showTrail();
});

// Language: the row in the menu panel and its twin on the start screen.
// Live — the menu stays open, the board stays paused exactly as it was, and
// focus stays on the pressed flag.
for (const id of ["menu-lang", "title-lang"]) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button[data-lang]");
    if (b) setLang(b.dataset.lang);
  });
}

// The in-page confirm.
on("confirm-yes", () => ui.answerConfirm(true));
on("confirm-no", () => ui.answerConfirm(false));

/* ================================================================ sound */

/*
 * No audio engine in v1 (DESIGN §5): the levels and the mute are stored for
 * real so the day sound arrives it arrives where the listener left it. The
 * hub rule that dragging a slider makes a sound has nothing to play yet; the
 * rule that it lifts the mute holds now.
 */
function setMuted(m) {
  muted = !!m;
  store.saveMuted(muted);
  ui.setMuted(muted);
}

for (const kind of ["music", "sfx"]) {
  const input = $(kind === "music" ? "music-vol" : "sfx-vol");
  ui.setLevel(kind, store.loadVolume(kind));
  input.addEventListener("input", () => {
    const v = Number(input.value) / 100;
    if (!Number.isFinite(v)) return;
    ui.setLevel(kind, v);
    store.saveVolume(kind, v);
    if (muted) setMuted(false);
  });
}
ui.setMuted(muted);

/* ============================================================= keyboard */

/*
 * Escape belongs to the shell (the play surface leaves it alone, DESIGN §5;
 * js/input.js returns before it looks at the key), and it always goes ONE
 * step back toward the way out (hub §2, "Escape goes one step back"):
 *
 *   an open question        → "no", as its own No button
 *   the menu, either face   → closed: the settings face's Back, or on the
 *                             pause face the run carries on (closeMenu
 *                             resumes exactly what openMenu paused)
 *   a board in play         → the menu opens and the board pauses
 *   the egg still hatching  → its Back (there is no board yet to pause)
 *   the level map, the free
 *   picker, the win card    → their own step back: Back, Back, and the
 *                             win card's second door (the list it came from)
 *   the title, nothing open → the Back to arcade button itself, only when it
 *                             is shown; otherwise nothing at all
 *
 * So Escape never throws a run away in one press, and Escape, Escape from
 * anywhere lands on the title, where the way out is. It used to open the
 * settings face on every screen, which never got anyone out. One key, one
 * action: preventDefault, and nothing else on the page handles Escape, so the
 * same press cannot also reach the board. Auto-repeat is ignored, so holding
 * the key cannot walk all the way out of a run and the zoo in one go.
 * M toggles mute anywhere outside a text field.
 *
 * Tab is kept inside an open dialog: aria-modal tells a screen reader the
 * rest of the page is inert, and focus wandering onto a hidden board behind
 * the scrim would make that a lie.
 */
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    if (e.repeat) return;
    if (ui.confirmOpen()) ui.answerConfirm(false);
    else if (ui.menuOpen()) closeMenu();
    else escapeFromScreen(ui.screenNow());
    return;
  }
  if (e.key === "Tab") {
    const dialog = ui.confirmOpen() ? $("confirm") : ui.menuOpen() ? $("menu") : null;
    if (dialog) trapTab(dialog, e);
    return;
  }
  if ((e.key === "m" || e.key === "M") && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const target = e.target;
    if (target && target.closest && target.closest("input:not([type=range]), textarea, [contenteditable='true']")) return;
    setMuted(!muted);
  }
});

/** Escape with nothing open: each screen's own step back (see above). Each
 *  case presses the visible button rather than calling its handler, so the
 *  key can never do something the button on screen would not. */
function escapeFromScreen(screen) {
  const press = (id) => {
    const el = $(id);
    if (el && !el.hidden && !el.disabled && !el.closest("[hidden]")) el.click();
  };
  if (screen === "title") ui.quitFromTitle();
  else if (screen === "trail") press("trail-back");
  else if (screen === "free") press("free-back");
  else if (screen === "win") press("win-other");
  else if (screen === "play") {
    if (!$("hatching").hidden) press("hatching-back");
    else openMenu();
  }
}

function trapTab(dialog, e) {
  const items = [...dialog.querySelectorAll("button, input")].filter((el) => !el.disabled && !el.closest("[hidden]"));
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
    e.preventDefault();
    first.focus();
  }
}

/* ============================================================= language */

/*
 * `arcade:lang` (js/i18n.js has already repainted every [data-i18n] node and
 * set <html lang>). Repaint what is worded at runtime, for every screen —
 * a hidden screen costs nothing and is then right when it is shown. The
 * board's own words (tools, coach, labels) repaint inside js/play.js, which
 * listens for the same event.
 */
function onLang() {
  paintTitle();
  if (ui.screenNow() === "trail") renderTrail({ keepScroll: true });
  paintFree();
  if (ui.menuOpen()) paintMenu();
  ui.setMuted(muted);
  ui.repaintWords();
}
document.addEventListener("arcade:lang", onLang);

/* ================================================================= boot */

// The static page is written in Norwegian, the default; paint it once in
// whatever language is stored (a no-op in bokmål, English for anyone who
// chose it) before the first screen is shown.
paintStatic(document);
ui.drawTitleScene();
paintTitle();
ui.showScreen("title");

// The way back to the arcade. exit.js is a deferred classic script from
// another repo and may be absent (served alone) or late (slow network), so
// look for it now, on load, and once more shortly after (lobbots); every
// outcome is normal.
if (!ui.wireExit()) {
  window.addEventListener("load", () => {
    if (!ui.wireExit()) setTimeout(() => ui.wireExit(), 1500);
  });
}
