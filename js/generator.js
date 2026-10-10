/*
 * generator.js — make a puzzle of a given band from a seed string.
 *
 * GENERATE TO TARGET, NOT GENERATE AND HOPE
 *   1. fill a random solution grid (solver.fillRandom);
 *   2. take clues away in a shuffled order — in 180° pairs when the band asks
 *      for symmetry — keeping a removal only if the board is still solved by
 *      logicSolve within the band's tier cap, still has at least the band's
 *      minimum clues, and never drops below the band's availability floor;
 *   3. stop at a clue target picked inside the band's range (the floor for
 *      required-tier bands, where fewer clues is what makes hard puzzles);
 *   4. if the band requires its tier, check the graded tier reached it.
 *   An attempt that misses (too many clues left, or too easy) retries with
 *   the sub-seed `${seed}/a${k}`, up to band.attempts.
 *
 * Every board the grader can solve is unique by construction — each
 * technique is a sound deduction, so the logic path proves there is exactly
 * one answer. The final grid is also compared with the solution, so an
 * unsound technique would fail an attempt here rather than ship a puzzle.
 * The tests then count solutions with brute force anyway.
 *
 * DETERMINISM
 *   Budgets are attempt counts, never wall-clock. If no attempt hits, the
 *   best one is returned, ranked by a deterministic score (closest to the
 *   required tier, then fewest clues outside the range, then the effort)
 *   with ties going to the lowest attempt index. Its `tier` is its REAL
 *   graded tier, and `hit` says whether the band's demand was met — the UI
 *   is never told a puzzle is harder than it is.
 */

import { makeRng } from "./rng.js";
import { fillRandom } from "./solver.js";
import { logicSolve } from "./grader.js";

function removalGroups(geo, sym, rng) {
  const n = geo.cells;
  const groups = [];
  for (let i = 0; i < n; i++) {
    const j = n - 1 - i;
    if (!sym) groups.push([i]);
    else if (i < j) groups.push([i, j]);
    else if (i === j) groups.push([i]); // the centre of an odd board
  }
  return rng.shuffle(groups);
}

function attempt(seed, band, geo) {
  const rng = makeRng(seed);
  const solution = fillRandom(geo, rng);
  const [lo, hi] = band.clues;
  const target = band.required ? lo : lo + rng.int(hi - lo + 1);
  const puzzle = solution.slice();
  let clues = geo.cells;
  const opts = { avail: band.minAvail > 1, minAvail: band.minAvail };
  const groups = removalGroups(geo, band.sym, rng);
  const ok = (r) => r.solved && r.minAvail >= band.minAvail;
  for (const g of groups) {
    if (clues <= target) break;
    if (clues - g.length < lo) continue;
    for (const i of g) puzzle[i] = 0;
    if (ok(logicSolve(puzzle, geo, band.tier, opts))) clues -= g.length;
    else for (const i of g) puzzle[i] = solution[i];
  }
  const graded = logicSolve(puzzle, geo, band.tier);

  const sound = graded.solved && solution.every((d, i) => graded.values[i] === d);
  const outside = clues > hi ? clues - hi : clues < lo ? lo - clues : 0;
  const tierShort = Math.max(0, band.tier - graded.maxTier);
  return {
    givens: puzzle,
    solution,
    clues,
    tier: Math.max(0, graded.maxTier),
    effort: graded.effort,
    minAvail: graded.minAvail === Infinity ? 0 : graded.minAvail,
    sound,
    exact: tierShort === 0,
    hit: sound && outside === 0 && (tierShort === 0 || !band.required),
    // Lower is better. Unsound attempts lose to everything; missing a
    // required tier loses to missing the clue range, and among required
    // misses the harder board wins. A non-required band only prefers a board
    // that uses its tier, and otherwise ties go to the earliest attempt, so
    // its random clue target survives (ranking by effort there would push
    // every board in the band to its clue floor).
    score:
      (sound ? 0 : 1e9) +
      tierShort * (band.required ? 1e6 : 1e2) +
      outside * 1e3 -
      (band.required ? Math.min(graded.effort, 999) : 0),
  };
}

/*
 * generate(seed, band, geo) → { givens, solution, clues, tier, effort,
 *                               minAvail, hit, attempt }
 */
export function generate(seed, band, geo) {
  let best = null;
  for (let k = 0; k < band.attempts; k++) {
    const a = attempt(k === 0 ? seed : `${seed}/a${k}`, band, geo);
    a.attempt = k;
    // A required band stops at its first hit. A non-required band also
    // stops at a hit that uses its tier, and otherwise spends its (cheap)
    // attempts looking for one before settling for the best.
    if (a.hit && a.exact) {
      best = a;
      break;
    }
    if (!best || a.score < best.score) best = a;
  }
  if (!best.sound) throw new Error(`zoodoku: no sound puzzle for ${seed}`);
  const { givens, solution, clues, tier, effort, minAvail, hit, attempt: k } = best;
  return { givens, solution, clues, tier, effort, minAvail, hit, attempt: k };
}
