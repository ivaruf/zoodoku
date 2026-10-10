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
 * Savanna 9×9 (DESIGN §2) — Dammen, Engen, Savannen in bokmål. REGION is the
 * one table of sizes and mascots, regionName() the one source of the words,
 * so the trail map, the play label and the win card cannot disagree. They
 * are the trail's flavour and stay there: menus name a board by its size.
 *
 * WORDS. Every string comes from js/i18n.js through t(), and every painter
 * here can be called again when the language changes (main.js does, on
 * `arcade:lang`), so a switch repaints in place: nothing is rebuilt that
 * would restart an animation or move focus.
 */

import { symbolMarkup } from "./animals.js";
import { t } from "./i18n.js";

export const REGION = {
  4: { size: "4×4", mascot: 3 }, // the whale, for the water
  6: { size: "6×6", mascot: 2 }, // the frog
  9: { size: "9×9", mascot: 4 }, // the lion
};

/** "Engen" / "Meadow" — or plain "7×7" for a size the table does not know. */
export const regionName = (size) => (REGION[size] ? t(`region.${size}`) : `${size}×${size}`);

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
export function renderTrail({ levels, solved, next, runLevel }, onPick, { keepScroll = false } = {}) {
  const host = $("trail-map");
  host.textContent = "";
  const groups = [];
  for (const info of levels) {
    let g = groups[groups.length - 1];
    if (!g || g.size !== info.size) groups.push((g = { size: info.size, items: [] }));
    g.items.push(info);
  }

  for (const g of groups) {
    const reg = REGION[g.size] || { size: "", mascot: 1 };
    const regName = regionName(g.size);
    const done = g.items.filter((i) => solved[i.level]).length;
    const section = document.createElement("section");
    section.className = `region region-${g.size}`;

    const head = document.createElement("header");
    head.className = "region-head";
    head.innerHTML = `<span class="region-mascot" aria-hidden="true">${sym(reg.mascot, "animals")}</span>`;
    const h3 = document.createElement("h3");
    h3.textContent = `${regName} `;
    const small = document.createElement("small");
    small.textContent = reg.size;
    h3.append(small);
    const count = document.createElement("span");
    count.className = "region-count";
    count.textContent = t("regionCount", done, g.items.length);
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
        (isHere ? `<span class="stop-tag">${t("stop.here")}</span>` : isNext ? `<span class="stop-tag">${t("stop.next")}</span>` : "");
      const state = isHere ? "here" : isSolved ? "solved" : isNext ? "next" : "";
      btn.setAttribute("aria-label", t("stopLabel", info.level, `${regName} ${reg.size}`.trim(), state));
      btn.addEventListener("click", () => onPick(info.level));
      grid.append(btn);
    });

    section.append(grid);
    host.append(section);
  }

  // Bring the stop that matters into view: the board you left, else the next
  // one. "center" so the region header above it is usually visible too. Not
  // on a language repaint: the player is looking where they scrolled to.
  if (keepScroll) return;
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
  for (let k = 0; k < pawCount; k++) {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = PAW;
    b.dataset.tier = String(k);
    b.classList.toggle("lit", k <= tier);
    b.setAttribute("aria-pressed", String(k === tier));
    const label = t("paws", k + 1, pawCount);
    b.setAttribute("aria-label", label);
    b.title = label;
    b.addEventListener("click", () => onPaw(Number(b.dataset.tier)));
    paws.append(b);
  }
  $("free-paws-note").textContent = pawWords(tier, pawCount);
}

/** One line under the paws, so a child knows what they just picked. */
function pawWords(tier, count) {
  const p = t("paws", tier + 1, count);
  const what = tier === 0 ? "paws.easy" : tier === count - 1 ? "paws.hardest" : tier >= 3 ? "paws.hard" : "paws.mid";
  return `${p} — ${t(what)}`;
}

/* ================================================================== play */

/** `text` may be a function, so a language switch can ask for it again. */
let playLabel = () => "";
export function setPlayLabel(text, { tutorial = false } = {}) {
  playLabel = typeof text === "function" ? text : () => text;
  $("play-label").textContent = playLabel();
  $("tutorial-skip").hidden = !tutorial;
}

/** The "hatching a puzzle…" egg. `failed` swaps the words for an apology. */
let hatchFailed = false;
export function setHatching(on, failed = false) {
  const el = $("hatching");
  el.hidden = !on;
  hatchFailed = !!failed;
  el.classList.toggle("failed", hatchFailed);
  el.querySelector("p").textContent = t(hatchFailed ? "hatch.failed" : "hatch.busy");
}

/* ============================================================== win card */

/**
 * The win card: the solved board, every animal hopping in a diagonal wave
 * (CSS, staggered by --i), a line of words and two doors. No score, no
 * timer, no stars — the full board is the reward (DESIGN §1).
 */
export function renderWin({ puzzle, skin, words }) {
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
  winWords = words;
  paintWinWords();
}

/** The card's words, kept as a function so a language switch repaints only
 *  them — re-rendering the board would restart its hop wave. */
let winWords = null;
function paintWinWords() {
  if (!winWords) return;
  const { title, sub, next, other } = winWords();
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
  $("menu-title").textContent = t(inPlay ? "menu.paused" : "menu.settings");
  $("menu-resume").hidden = !inPlay;
  $("menu-skin-row").hidden = !inPlay;
  $("menu-board-actions").hidden = !inPlay;
  $("menu-close").hidden = inPlay; // Resume is the way back in play
  $("menu-leave").textContent = t(leaveLabel || "door.levels");
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
let confirmWords = null;
function paintConfirm() {
  if (!confirmWords) return;
  const { text, note = "", yes, no } = confirmWords();
  $("confirm-text").textContent = text;
  $("confirm-note").textContent = note;
  $("confirm-note").hidden = !note;
  $("confirm-yes").textContent = yes;
  $("confirm-no").textContent = no;
}

/** `words` is a function returning { text, note, yes, no }, so an open
 *  question can be asked again in the other language without closing. */
export function ask(words) {
  if (confirmResolve) confirmResolve(false);
  confirmWords = words;
  paintConfirm();
  const back = document.activeElement;
  $("confirm").hidden = false;
  document.body.classList.add("confirming");
  $("confirm-no").focus();
  return new Promise((resolve) => {
    confirmResolve = (answer) => {
      confirmResolve = null;
      confirmWords = null;
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
  const label = t(muted ? "unmute" : "mute");
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
let exitApi = null;
let exitRefused = false;

/** The exit buttons' words. verb() is handed BOTH phrasings in the current
 *  language and picks the one that is true here; a switch asks again. */
function paintExit() {
  if (!exitApi) return;
  let label;
  try {
    label = exitRefused ? t("exit.refused") : exitApi.verb({ arcade: t("exit.arcade"), app: t("exit.close") });
  } catch {
    label = t("exit.arcade");
  }
  for (const id of ["title-exit", "menu-exit"]) {
    const el = $(id);
    if (el && !el.hidden) el.textContent = label;
  }
}

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
  exitApi = exit;
  for (const id of ["title-exit", "menu-exit"]) {
    const el = $(id);
    if (!el) continue;
    el.hidden = false;
    el.addEventListener("click", () => {
      Promise.resolve(exit.quit())
        .then((how) => {
          // 'refused': the browser would not close a window it did not open.
          // The game is still running, so say so instead of a dead button.
          if (how !== "refused") return;
          exitRefused = true;
          for (const other of ["title-exit", "menu-exit"]) if ($(other)) $(other).disabled = true;
          paintExit();
        })
        .catch(() => {});
    });
  }
  paintExit();
  return true;
}

/* ============================================================ language */

/**
 * Repaint every runtime-drawn word that is on screen now, in the language
 * js/i18n.js just switched to. paintStatic has already done the [data-i18n]
 * nodes; main.js repaints what only it can word (the title door, the trail
 * map, the free picker, the menu face). Nothing here moves focus.
 */
export function repaintWords() {
  $("play-label").textContent = playLabel();
  $("hatching").querySelector("p").textContent = t(hatchFailed ? "hatch.failed" : "hatch.busy");
  paintWinWords();
  paintConfirm();
  paintExit();
}
