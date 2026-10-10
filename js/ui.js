/*
 * ui.js — the shell's DOM: drawing the screens, the menu panel, the in-page
 * confirm, the corner's mute plate and the way back to the arcade.
 *
 * WHAT LIVES HERE AND WHAT DOES NOT. This file draws and reports; it decides
 * nothing about the game. Which puzzle starts, what is saved, where "Back"
 * goes — all of that is js/main.js. The split exists so main.js reads as the
 * game's flow from top to bottom, and this file can be read as "what the
 * player sees" without wading through storage and engine calls.
 *
 * Everything the player looks at is DOM over the meadow (hub §2: canvas only
 * where it earns it; the board itself is Lane B's DOM grid). The animals come
 * from js/animals.js as inline SVG strings, our own code, so innerHTML of
 * them is safe; everything else that carries text is set with textContent.
 *
 * NAMES. The three board sizes are places on the trail: Pond 4×4, Meadow 6×6,
 * Savanna 9×9 (DESIGN §2). REGION is the one table of those words, so the
 * trail map, the title door, the play label and the win card cannot disagree.
 */

import { symbolMarkup } from "./animals.js";

export const REGION = {
  4: { name: "Pond", size: "4×4", mascot: 3 }, // the whale, for the water
  6: { name: "Meadow", size: "6×6", mascot: 2 }, // the frog
  9: { name: "Savanna", size: "9×9", mascot: 4 }, // the lion
};

export const $ = (id) => document.getElementById(id);

/* ============================================================== screens */

const SCREENS = ["title", "trail", "free", "play", "win"];
let current = "title";

/**
 * Show exactly one screen. Focus moves to the screen's [data-autofocus]
 * control (with preventScroll, so a long trail map does not jump) — without
 * that, keyboard focus is left on a button that has just been hidden and the
 * next Tab starts from the top of the document.
 */
export function showScreen(name) {
  current = name;
  for (const s of SCREENS) {
    const el = $(`screen-${s}`);
    if (el) el.hidden = s !== name;
  }
  document.body.dataset.screen = name;
  const target = $(`screen-${name}`)?.querySelector("[data-autofocus]:not([hidden])");
  if (target) {
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }
}

export const screenNow = () => current;

/* ================================================================ glyphs */

/** A paw: one pad and four toes, filled with currentColor. */
const PAW =
  '<svg class="paw" viewBox="0 0 24 24" aria-hidden="true">' +
  '<ellipse cx="12" cy="16" rx="5.2" ry="4.4"/>' +
  '<circle cx="5.6" cy="10.4" r="2.2"/><circle cx="9.6" cy="6.6" r="2.3"/>' +
  '<circle cx="14.4" cy="6.6" r="2.3"/><circle cx="18.4" cy="10.4" r="2.2"/></svg>';

/** A tick, stroked, for solved stops. */
const TICK =
  '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';

/** symbolMarkup, guarded: a missing animal costs a tile, never the screen. */
function sym(d, skin) {
  try {
    return symbolMarkup(d, skin) || "";
  } catch (err) {
    console.warn("Zoodoku: no symbol for", d, skin, err);
    return `<span class="sym-fallback">${Number(d) || ""}</span>`;
  }
}

/* ================================================================= title */

/**
 * The little scene under the wordmark: a 4×4 board, tilted like one left on a
 * table, half filled, with the fox lifted above it mid-drag — the whole game
 * in one picture, drawn once at boot.
 */
export function drawTitleScene() {
  const host = $("title-scene");
  if (!host) return;
  const solution = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
  // Index 6 (a fox) is left empty: that is where the lifted fox is headed.
  const shown = [1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1];
  let cells = "";
  solution.forEach((d, i) => {
    const r = Math.floor(i / 4);
    const c = i % 4;
    const edge = `${c === 1 ? " bx-r" : ""}${r === 1 ? " bx-b" : ""}`;
    cells += `<div class="mini-cell${edge}" style="--i:${i}">${shown[i] ? sym(d, "animals") : ""}</div>`;
  });
  host.innerHTML =
    `<div class="mini-board">${cells}</div>` +
    `<div class="mini-lift">${sym(1, "animals")}</div>`;
}

/**
 * The title's doors. `primary` is { main, sub }, already worded by main.js;
 * `newHere` lights the gentle "New here?" tag on How to play rather than
 * forcing the tutorial on anybody.
 */
export function paintTitle({ primary, newHere }) {
  $("door-trail-main").textContent = primary.main;
  $("door-trail-sub").textContent = primary.sub;
  $("howto-tag").hidden = !newHere;
  $("door-howto").classList.toggle("nudge", !!newHere);
}

/* ============================================================= trail map */

const COLS = 5;

/**
 * The trail: sixty stops winding back and forth, region by region.
 *
 * Each region is a grid of COLS columns walked as a snake (left to right,
 * then right to left), with an SVG path drawn underneath through the centre
 * of every cell. The grid has NO gap and uniform cells, so with
 * preserveAspectRatio="none" and a non-scaling stroke the path's (col+0.5,
 * row+0.5) points land on the button centres at any width — no measuring.
 *
 * `levels` is [{ level, size }...] from levels.js; grouping is by size, read
 * from the data rather than from hard-coded ranges, so the engine lane can
 * retune the table without this file noticing.
 */
export function renderTrail({ levels, solved, next, runLevel }, onPick) {
  const host = $("trail-map");
  host.textContent = "";
  const groups = [];
  for (const info of levels) {
    let g = groups[groups.length - 1];
    if (!g || g.size !== info.size) groups.push((g = { size: info.size, items: [] }));
    g.items.push(info);
  }

  for (const g of groups) {
    const reg = REGION[g.size] || { name: `${g.size}×${g.size}`, size: "", mascot: 1 };
    const done = g.items.filter((i) => solved[i.level]).length;
    const section = document.createElement("section");
    section.className = `region region-${g.size}`;

    const head = document.createElement("header");
    head.className = "region-head";
    head.innerHTML = `<span class="region-mascot" aria-hidden="true">${sym(reg.mascot, "animals")}</span>`;
    const h3 = document.createElement("h3");
    h3.textContent = `${reg.name} `;
    const small = document.createElement("small");
    small.textContent = reg.size;
    h3.append(small);
    const count = document.createElement("span");
    count.className = "region-count";
    count.textContent = `${done} of ${g.items.length}`;
    head.append(h3, count);
    section.append(head);

    const rows = Math.ceil(g.items.length / COLS);
    const grid = document.createElement("div");
    grid.className = "trail-grid";
    grid.style.setProperty("--rows", rows);

    // The path first, so the stops paint on top of it.
    const pts = g.items.map((_, i) => cellOf(i));
    let d = "";
    pts.forEach(([r, c], i) => {
      const x = c + 0.5;
      const y = r + 0.5;
      if (i === 0) d += `M${x} ${y}`;
      else if (pts[i - 1][0] !== r) {
        // A U-turn at the end of a row: bulge outward so the path winds
        // rather than zig-zags.
        const out = c === 0 ? -0.45 : 0.45;
        d += ` C${x + out} ${y - 1} ${x + out} ${y} ${x} ${y}`;
      } else d += ` L${x} ${y}`;
    });
    grid.innerHTML =
      `<svg class="trail-path" viewBox="0 0 ${COLS} ${rows}" preserveAspectRatio="none" aria-hidden="true">` +
      `<path d="${d}" vector-effect="non-scaling-stroke"/></svg>`;

    g.items.forEach((info, i) => {
      const [r, c] = pts[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stop";
      btn.style.gridRow = String(r + 1);
      btn.style.gridColumn = String(c + 1);
      btn.dataset.level = String(info.level);
      const isSolved = !!solved[info.level];
      const isNext = info.level === next;
      const isHere = info.level === runLevel;
      if (isSolved) btn.classList.add("solved");
      if (isNext) btn.classList.add("next");
      if (isHere) btn.classList.add("here");
      btn.innerHTML =
        `<span class="stop-num">${info.level}</span>` +
        (isSolved ? `<span class="stop-tick">${TICK}</span>` : "") +
        (isHere ? '<span class="stop-tag">your puzzle</span>' : isNext ? '<span class="stop-tag">a little harder</span>' : "");
      const state = isHere ? ", your puzzle in progress" : isSolved ? ", solved" : isNext ? ", next — a little harder" : "";
      btn.setAttribute("aria-label", `Level ${info.level}, ${reg.name} ${reg.size}${state}`);
      btn.addEventListener("click", () => onPick(info.level));
      grid.append(btn);
    });

    section.append(grid);
    host.append(section);
  }

  // Bring the stop that matters into view: the board you left, else the next
  // one. "center" so the region header above it is usually visible too.
  const focus = host.querySelector(".stop.here") || host.querySelector(".stop.next");
  if (focus) {
    requestAnimationFrame(() => {
      try {
        focus.scrollIntoView({ block: "center" });
      } catch {
        focus.scrollIntoView();
      }
    });
  }
}

/** Index within a region → [row, col] along the snake. */
function cellOf(i) {
  const r = Math.floor(i / COLS);
  const k = i % COLS;
  return [r, r % 2 === 0 ? k : COLS - 1 - k];
}

/* ============================================================= free roam */

/**
 * Paint the free-roam picker from { size, tier, skin } and the paw count for
 * this size. The paw row is rebuilt each time because its length depends on
 * the board (3, 4 or 7 paws). It reads like a star rating — tap the third and
 * three paws light — but only the chosen button is aria-pressed, and each one
 * says what it means in words: "3 paws of 7".
 */
export function paintFree({ size, tier, skin }, pawCount, onPaw) {
  for (const b of $("free-size").querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(Number(b.dataset.size) === size));
  }
  for (const b of $("free-skin").querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.skin === skin));
  }
  const paws = $("free-paws");
  paws.textContent = "";
  paws.style.setProperty("--count", pawCount);
  for (let t = 0; t < pawCount; t++) {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = PAW;
    b.dataset.tier = String(t);
    b.classList.toggle("lit", t <= tier);
    b.setAttribute("aria-pressed", String(t === tier));
    const label = `${t + 1} ${t === 0 ? "paw" : "paws"} of ${pawCount}`;
    b.setAttribute("aria-label", label);
    b.title = label;
    b.addEventListener("click", () => onPaw(t));
    paws.append(b);
  }
  $("free-paws-note").textContent = pawWords(tier, pawCount);
}

/** One line under the paws, so a child knows what they just picked. */
function pawWords(tier, count) {
  const p = `${tier + 1} ${tier === 0 ? "paw" : "paws"} of ${count}`;
  if (tier === 0) return `${p} — a gentle stroll.`;
  if (tier === count - 1) return `${p} — the trickiest we have.`;
  if (tier >= 3) return `${p} — needs notes and a sharp eye.`;
  return `${p} — a proper puzzle.`;
}

/* ================================================================== play */

export function setPlayLabel(text, { tutorial = false } = {}) {
  $("play-label").textContent = text;
  $("tutorial-skip").hidden = !tutorial;
}

/** The "hatching a puzzle…" egg. `failed` swaps the words for an apology. */
export function setHatching(on, failed = false) {
  const el = $("hatching");
  el.hidden = !on;
  el.classList.toggle("failed", !!failed);
  el.querySelector("p").textContent = failed
    ? "That one wouldn't hatch. Try another?"
    : "Hatching a puzzle…";
}

/* ============================================================== win card */

/**
 * The win card: the solved board, every animal hopping in a diagonal wave
 * (CSS, staggered by --i), a line of words and two doors. No score, no
 * timer, no stars — the full board is the reward (DESIGN §1).
 */
export function renderWin({ puzzle, skin, title, sub, next, other }) {
  const N = puzzle.size;
  const { h, w } = puzzle.box;
  const host = $("win-board");
  host.style.setProperty("--n", N);
  host.dataset.size = String(N);
  let html = "";
  for (let i = 0; i < N * N; i++) {
    const r = Math.floor(i / N);
    const c = i % N;
    const edge = `${(c + 1) % w === 0 && c < N - 1 ? " bx-r" : ""}${(r + 1) % h === 0 && r < N - 1 ? " bx-b" : ""}`;
    html += `<div class="win-cell${edge}" style="--i:${r + c}">${sym(puzzle.solution[i], skin)}</div>`;
  }
  host.innerHTML = html;
  $("win-title").textContent = title;
  $("win-sub").textContent = sub;
  $("win-next").textContent = next;
  $("win-other").textContent = other;
}

/* ============================================================ menu panel */

/**
 * Paint the panel's face. In play it is the pause — kicker, "Paused", the way
 * back to the puzzle, the board's own options, and the two ways to leave it.
 * Elsewhere it is settings, and everything that would be a lie without a
 * board (Resume, Restart, the skin of a board that does not exist) is hidden.
 */
export function paintMenu({ inPlay, skin, conflicts, leaveLabel }) {
  $("menu-kicker").hidden = !inPlay;
  $("menu-title").textContent = inPlay ? "Paused" : "Settings";
  $("menu-resume").hidden = !inPlay;
  $("menu-skin-row").hidden = !inPlay;
  $("menu-board-actions").hidden = !inPlay;
  $("menu-close").hidden = inPlay; // Resume is the way back in play
  $("menu-leave").textContent = leaveLabel || "Trail map";
  for (const b of $("menu-skin").querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.skin === skin));
  }
  paintConflicts(conflicts);
}

export function paintConflicts(on) {
  for (const b of $("menu-conflicts").querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String((b.dataset.on === "true") === on));
  }
}

export function paintSkin(skin) {
  for (const b of $("menu-skin").querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.skin === skin));
  }
}

let menuFocusBack = null;

export function showMenu() {
  menuFocusBack = document.activeElement;
  $("menu-scrim").hidden = false;
  $("menu").hidden = false;
  const first = $("menu").querySelector(".btn.primary:not([hidden])") || $("menu-close");
  (first || $("menu")).focus();
}

export function hideMenu() {
  $("menu-scrim").hidden = true;
  $("menu").hidden = true;
  // Give focus back to what had it, if that still exists on screen; otherwise
  // the menu plate, which is always there.
  const back = menuFocusBack && menuFocusBack.isConnected && !menuFocusBack.closest("[hidden]") ? menuFocusBack : $("menu-open");
  menuFocusBack = null;
  try {
    back.focus({ preventScroll: true });
  } catch {
    /* focus is a courtesy */
  }
}

export const menuOpen = () => !$("menu").hidden;

/* =============================================================== confirm */

let confirmResolve = null;

/**
 * An in-page question, resolving true for yes and false for no or Escape.
 * confirm() would be an OS dialog that belongs to no game and blocks the page,
 * and in the arcade's iframe some browsers suppress it outright.
 * The SAFE answer is the primary, focused button: a child mashing Enter keeps
 * their puzzle.
 */
export function ask({ text, note = "", yes, no }) {
  if (confirmResolve) confirmResolve(false);
  $("confirm-text").textContent = text;
  $("confirm-note").textContent = note;
  $("confirm-note").hidden = !note;
  $("confirm-yes").textContent = yes;
  $("confirm-no").textContent = no;
  const back = document.activeElement;
  $("confirm").hidden = false;
  document.body.classList.add("confirming");
  $("confirm-no").focus();
  return new Promise((resolve) => {
    confirmResolve = (answer) => {
      confirmResolve = null;
      $("confirm").hidden = true;
      document.body.classList.remove("confirming");
      if (back && back.isConnected && !back.closest("[hidden]")) {
        try {
          back.focus({ preventScroll: true });
        } catch {
          /* courtesy */
        }
      }
      resolve(answer);
    };
  });
}

export const confirmOpen = () => !!confirmResolve;
export function answerConfirm(answer) {
  if (confirmResolve) confirmResolve(answer);
}

/* ================================================================= sound */

/**
 * Mute: aria-pressed, aria-label and title in one write, so what is drawn
 * (CSS reads aria-pressed) and what a screen reader hears cannot drift.
 */
export function setMuted(muted) {
  const b = $("mute-toggle");
  b.setAttribute("aria-pressed", String(muted));
  const label = muted ? "Unmute" : "Mute";
  b.setAttribute("aria-label", label);
  b.title = `${label} (M)`;
}

/** Put a 0–1 level on a slider row: the range, its <output>, and the fill. */
export function setLevel(kind, v) {
  const input = $(kind === "music" ? "music-vol" : "sfx-vol");
  const out = $(kind === "music" ? "music-vol-out" : "sfx-vol-out");
  const pct = Math.round(v * 100);
  input.value = String(pct);
  out.textContent = String(pct);
  input.style.setProperty("--fill", `${pct}%`);
}

/* ========================================================== arcade door */

/**
 * The way back to the arcade, on the title and in the menu. Wired exactly as
 * neonfox/js/ui.js does it: shown only when there is somewhere to go — a
 * launcher framing us, or an installed window that can close — asked through
 * framed()/standalone() rather than offers(), because the exit.js that
 * answers may be an older cached copy that predates offers() and a guard on
 * the new name fails CLOSED, inside the arcade, where the way out matters
 * most. The label comes from verb() so it never promises what quit() won't do.
 *
 * Returns false when window.ArcadeExit has not turned up yet; main.js retries
 * on load and again 1500 ms later (lobbots), and missing for good is a normal
 * outcome when the game is served on its own.
 */
let exitWired = false;
export function wireExit() {
  if (exitWired) return true;
  const exit = window.ArcadeExit;
  if (!exit) return false;
  exitWired = true;
  let show = false;
  try {
    show = exit.framed() || exit.standalone();
  } catch {
    show = false;
  }
  if (!show) return true;
  const label = exit.verb({ arcade: "Back to arcade", app: "Close" });
  for (const id of ["title-exit", "menu-exit"]) {
    const el = $(id);
    if (!el) continue;
    el.hidden = false;
    el.textContent = label;
    el.addEventListener("click", () => {
      Promise.resolve(exit.quit())
        .then((how) => {
          // 'refused': the browser would not close a window it did not open.
          // The game is still running, so say so instead of a dead button.
          if (how !== "refused") return;
          el.textContent = "Close this window yourself";
          el.disabled = true;
        })
        .catch(() => {});
    });
  }
  return true;
}
