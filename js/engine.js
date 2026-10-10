/*
 * engine.js — the one door the UI uses into the engine.
 *
 *   getPuzzle(spec) → Promise<Puzzle>
 *     spec = { kind:'trail', level }            level 1..60
 *          | { kind:'free', size, tier, n }     size 4|6|9, tier 0-based
 *                                               (paws - 1; see pawsToTier),
 *                                               n any integer ≥ 0
 *   geometry(size)  → the frozen board geometry (grid.js)
 *   buildPuzzle(spec) → Puzzle, synchronously (the worker and the tests)
 *   seedFor(spec)   → the seed string, which is also the puzzle's id
 *
 * SEEDS are `zoodoku-v1-trail-<level>` and `zoodoku-v1-free-<size>-<tier>-<n>`.
 * The "v1" is the generator's version: change anything that alters which
 * puzzle a seed produces (a band, a technique's order, the rng) and every
 * level changes on every device. Runs in progress are safe because the shell
 * stores the whole puzzle (DESIGN §5), but solved ticks on the trail would
 * then describe boards that no longer exist — bump to v2 deliberately if it
 * ever matters.
 *
 * PUZZLE
 *   { id, size, box:{h,w}, givens, solution, tier, notes,
 *     kind, level|null, bandTier, clues, hit }
 *   givens/solution are plain arrays (they go through JSON into storage and
 *   through structured clone out of the worker).
 *   tier      the REAL graded tier — the hardest technique the puzzle needs.
 *             Usually equal to bandTier; lower when the band's demand was
 *             not met within budget, or for bands that only cap the tier
 *             (on 4×4, box singles almost always suffice, so the T1/T2 bands
 *             grade T0 and differ in clue count instead).
 *   bandTier  the tier the level/paws asked for.
 *   notes     size === 9 || bandTier >= 3 — offered from the band that can
 *             need them, decided by the band so it does not flicker between
 *             puzzles of one level.
 *   hit       whether the generator met the band's targets.
 *
 * THREADS
 *   9×9 boards, and any band that requires its tier (the 6×6 T3 lottery can
 *   take a few hundred ms), are built in one long-lived module Worker
 *   (gen-worker.js). If the Worker cannot be constructed, fails to load, or
 *   errors, the same function runs on the main thread after a setTimeout, so
 *   the caller can paint a "finding a puzzle…" state first. Small easy boards
 *   take under 3 ms and stay on the main thread. Results are cached in memory
 *   by id, so asking twice — say, Restart — costs nothing.
 */

import { geometry } from "./grid.js";
import { generate } from "./generator.js";
import { levelInfo, freeBand, FREE_TIERS } from "./levels.js";

export { geometry };

function bandFor(spec) {
  if (!spec || typeof spec !== "object") throw new Error("zoodoku: no spec");
  if (spec.kind === "trail") {
    const info = levelInfo(spec.level);
    if (!info) throw new Error(`zoodoku: no trail level ${spec.level}`);
    return { band: info.band, seed: `zoodoku-v1-trail-${info.level}`, level: info.level };
  }
  if (spec.kind === "free") {
    const size = Number(spec.size);
    const tier = Number(spec.tier);
    const n = Number(spec.n);
    if (!FREE_TIERS[size]) throw new Error(`zoodoku: no board of size ${spec.size}`);
    if (!Number.isInteger(tier) || tier < 0 || tier >= FREE_TIERS[size]) {
      throw new Error(`zoodoku: no tier ${spec.tier} for size ${size}`);
    }
    if (!Number.isInteger(n) || n < 0) throw new Error(`zoodoku: bad free-roam n ${spec.n}`);
    return { band: freeBand(size, tier), seed: `zoodoku-v1-free-${size}-${tier}-${n}`, level: null };
  }
  throw new Error(`zoodoku: unknown spec kind ${spec.kind}`);
}

export function seedFor(spec) {
  return bandFor(spec).seed;
}

export function buildPuzzle(spec) {
  const { band, seed, level } = bandFor(spec);
  const geo = geometry(band.size);
  const g = generate(seed, band, geo);
  return {
    id: seed,
    size: band.size,
    box: { h: geo.bh, w: geo.bw },
    givens: Array.from(g.givens),
    solution: Array.from(g.solution),
    tier: g.tier,
    notes: band.size === 9 || band.tier >= 3,
    kind: spec.kind,
    level,
    bandTier: band.tier,
    clues: g.clues,
    hit: g.hit,
  };
}

/* ---------- threads ---------- */

let worker = null;
let workerDead = false;
let seq = 0;
const pending = new Map(); // id → { resolve, fallback }

function killWorker() {
  workerDead = true;
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* already gone */
    }
  }
  worker = null;
  const waiting = [...pending.values()];
  pending.clear();
  for (const p of waiting) p.fallback();
}

function getWorker() {
  if (workerDead) return null;
  if (worker) return worker;
  if (typeof Worker === "undefined") {
    workerDead = true;
    return null;
  }
  try {
    worker = new Worker(new URL("./gen-worker.js", import.meta.url), { type: "module" });
  } catch {
    // No module workers (older Safari throws here), or a CSP that forbids
    // them: the main thread will do.
    workerDead = true;
    return null;
  }
  worker.onmessage = (e) => {
    const { id, puzzle, error } = e.data || {};
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error || !puzzle || !Array.isArray(puzzle.givens)) p.fallback();
    else p.resolve(puzzle);
  };
  // A worker that fails to load (a 404, a browser that parsed the module as
  // a classic script) reports here. preventDefault keeps it off the page's
  // crash bar: a missing worker is a slower puzzle, not a broken game.
  worker.onerror = (ev) => {
    if (ev && ev.preventDefault) ev.preventDefault();
    killWorker();
  };
  worker.onmessageerror = () => killWorker();
  return worker;
}

function onMainThread(spec) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(buildPuzzle(spec));
      } catch (err) {
        reject(err);
      }
    }, 0);
  });
}

function inWorker(spec) {
  const w = getWorker();
  if (!w) return onMainThread(spec);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, {
      resolve,
      fallback: () => onMainThread(spec).then(resolve, reject),
    });
    try {
      w.postMessage({ id, spec: { ...spec } });
    } catch {
      pending.delete(id);
      onMainThread(spec).then(resolve, reject);
    }
  });
}

const cache = new Map(); // id → Promise<Puzzle>

export function getPuzzle(spec) {
  let info;
  try {
    info = bandFor(spec);
  } catch (err) {
    return Promise.reject(err);
  }
  const hit = cache.get(info.seed);
  if (hit) return hit.then(copy);
  const clean =
    spec.kind === "trail"
      ? { kind: "trail", level: info.level }
      : { kind: "free", size: Number(spec.size), tier: Number(spec.tier), n: Number(spec.n) };
  const heavy = info.band.size === 9 || info.band.required;
  const p = (heavy ? inWorker(clean) : onMainThread(clean)).catch((err) => {
    cache.delete(info.seed);
    throw err;
  });
  cache.set(info.seed, p);
  // The cache is tiny on purpose: a handful of recent boards, oldest out.
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  return p.then(copy);
}

/* Every caller gets its own arrays, so one screen can never edit another's. */
function copy(pz) {
  return { ...pz, box: { ...pz.box }, givens: pz.givens.slice(), solution: pz.solution.slice() };
}
