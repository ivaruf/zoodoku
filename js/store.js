/*
 * store.js — everything Zoodoku remembers, and the only file that touches
 * localStorage.
 *
 * WHY ONE FILE. Every game in the hub shares the ivaruf.github.io origin, so
 * localStorage is ONE namespace shared with fishtank, maxgear, neonfox and the
 * rest (hub CLAUDE.md §6). Anything at all may have written under any key, in
 * any shape, at any time — an older build of this game, a curious child in
 * devtools, a browser extension. So every read here is defensive: it parses
 * inside try/catch, checks the shape it got rather than trusting it, rejects
 * non-finite numbers with Number.isFinite (neonfox, lobbots and maxgear all
 * miss that, DESIGN §6), and hands back a clean default when anything is off.
 * A bad key costs a setting, never the boot.
 *
 * Every write is in try/catch too: private mode and a full quota are real, and
 * the game must play on regardless — it just forgets.
 *
 * THE KEYS (DESIGN §5). `<slug>.<thing>.v<n>`, per hub §6. Never rename one
 * once it has shipped: a renamed progress key wipes every player's trail.
 *
 *   zoodoku.progress.v1   { solved: { [level]: true }, tutorialDone, freeN }
 *   zoodoku.run.v1        { spec, puzzle, skin, play } — the board in progress
 *   zoodoku.settings.v1   { conflicts, autoNotes }
 *   zoodoku.vol.music.v1  0–1
 *   zoodoku.vol.sfx.v1    0–1
 *   zoodoku.muted.v1      true / false
 *
 * The run stores the WHOLE puzzle, not just its spec, so a deploy that changes
 * the generator can never swap the board out from under a child halfway
 * through it (hub §1, "respect the session").
 */

const KEY = {
  progress: "zoodoku.progress.v1",
  run: "zoodoku.run.v1",
  settings: "zoodoku.settings.v1",
  music: "zoodoku.vol.music.v1",
  sfx: "zoodoku.vol.sfx.v1",
  muted: "zoodoku.muted.v1",
};

const SIZES = [4, 6, 9];

/* ---------------------------------------------------------------- raw IO */

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return undefined;
    return JSON.parse(raw);
  } catch {
    // Blocked storage, or a value that is not JSON. Either way: no value.
    return undefined;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota or private mode. The game carries on; it simply forgets.
    return false;
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do: if we cannot remove it we could not have read it either.
  }
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isInt = (v) => Number.isFinite(v) && Math.floor(v) === v;

/* -------------------------------------------------------------- progress */

/**
 * The trail and everything else that is a record of what you have done.
 * Only well-formed entries survive the read: a level key must be a positive
 * integer and its value literally true; a freeN counter must be a finite
 * non-negative integer under a "<size>-<tier>" key.
 */
export function loadProgress() {
  const raw = readJSON(KEY.progress);
  const out = { solved: {}, tutorialDone: false, freeN: {} };
  if (!isObj(raw)) return out;
  if (isObj(raw.solved)) {
    for (const k of Object.keys(raw.solved)) {
      const n = Number(k);
      if (isInt(n) && n > 0 && n < 1000 && raw.solved[k] === true) out.solved[n] = true;
    }
  }
  out.tutorialDone = raw.tutorialDone === true;
  if (isObj(raw.freeN)) {
    for (const k of Object.keys(raw.freeN)) {
      const v = raw.freeN[k];
      if (/^(4|6|9)-\d{1,2}$/.test(k) && isInt(v) && v >= 0) out.freeN[k] = v;
    }
  }
  return out;
}

export function saveProgress(p) {
  return writeJSON(KEY.progress, {
    solved: p.solved || {},
    tutorialDone: !!p.tutorialDone,
    freeN: p.freeN || {},
  });
}

/* ------------------------------------------------------------------- run */

/** A digit array of length N*N whose every value is an integer in lo..N. */
function digits(arr, N, lo) {
  if (!Array.isArray(arr) || arr.length !== N * N) return false;
  for (const v of arr) if (!isInt(v) || v < lo || v > N) return false;
  return true;
}

/**
 * The board in progress, or null. This is the strictest read in the file,
 * because a malformed puzzle handed to the play surface is a broken screen
 * rather than a forgotten preference: size must be 4/6/9, the box must tile
 * it, givens and solution must be digit arrays of the right length, and every
 * given must agree with the solution. The play lane's own serialized state is
 * passed through as-is — it is that lane's format and its own mountPlay is
 * the thing that must validate it — but it must at least be an object.
 */
export function loadRun() {
  const raw = readJSON(KEY.run);
  if (!isObj(raw) || !isObj(raw.spec) || !isObj(raw.puzzle)) return null;
  const { spec, puzzle } = raw;

  if (spec.kind === "trail") {
    if (!isInt(spec.level) || spec.level < 1) return null;
  } else if (spec.kind === "free") {
    if (!SIZES.includes(spec.size) || !isInt(spec.tier) || spec.tier < 0 || !isInt(spec.n)) return null;
  } else {
    return null; // tutorial boards are never saved; anything else is noise
  }

  const N = puzzle.size;
  if (!SIZES.includes(N)) return null;
  const box = puzzle.box;
  if (!isObj(box) || !isInt(box.h) || !isInt(box.w) || box.h * box.w !== N) return null;
  if (!digits(puzzle.givens, N, 0) || !digits(puzzle.solution, N, 1)) return null;
  for (let i = 0; i < N * N; i++) {
    if (puzzle.givens[i] && puzzle.givens[i] !== puzzle.solution[i]) return null;
  }

  return {
    spec: { ...spec },
    puzzle: {
      id: typeof puzzle.id === "string" ? puzzle.id : "",
      size: N,
      box: { h: box.h, w: box.w },
      givens: puzzle.givens.slice(),
      solution: puzzle.solution.slice(),
      tier: isInt(puzzle.tier) ? puzzle.tier : 0,
      notes: puzzle.notes === true,
    },
    skin: raw.skin === "numbers" ? "numbers" : "animals",
    play: isObj(raw.play) ? raw.play : null,
  };
}

export function saveRun(run) {
  return writeJSON(KEY.run, run);
}

export function clearRun() {
  remove(KEY.run);
}

/* -------------------------------------------------------------- settings */

export function loadSettings() {
  const raw = readJSON(KEY.settings);
  const out = { conflicts: true, autoNotes: true };
  if (!isObj(raw)) return out;
  if (typeof raw.conflicts === "boolean") out.conflicts = raw.conflicts;
  if (typeof raw.autoNotes === "boolean") out.autoNotes = raw.autoNotes;
  return out;
}

export function saveSettings(s) {
  return writeJSON(KEY.settings, { conflicts: !!s.conflicts, autoNotes: !!s.autoNotes });
}

/* ----------------------------------------------------------------- sound */

/**
 * A level, 0–1. Stored as a bare number. Non-finite (NaN, Infinity — which
 * JSON cannot hold but a hand-written "1e999" parses to) and out-of-range are
 * rejected rather than clamped: a value we did not write is not one to trust.
 */
export function loadVolume(kind) {
  const raw = readJSON(kind === "music" ? KEY.music : KEY.sfx);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw;
  return kind === "music" ? 0.6 : 0.8;
}

export function saveVolume(kind, v) {
  if (!Number.isFinite(v)) return false;
  return writeJSON(kind === "music" ? KEY.music : KEY.sfx, Math.min(1, Math.max(0, v)));
}

export function loadMuted() {
  return readJSON(KEY.muted) === true;
}

export function saveMuted(m) {
  return writeJSON(KEY.muted, !!m);
}
