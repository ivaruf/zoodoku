/*
 * levels.js — the trail, the free-roam paws, and the three tutorial boards.
 *
 * THE TRAIL (DESIGN §2) is sixty levels in fourteen bands. A band says how
 * big the board is, which skin it opens in, the hardest technique tier it may
 * ask for (`tier`), whether it must actually ask for it (`required`), the clue
 * range the generator aims for, the availability floor (how many cells must
 * be fillable at every moment — see grader.js), and whether clues come in
 * 180° pairs. The levels are a path, not a gate: nothing here locks anything.
 *
 * `attempts` is the generator's whole budget for a band, counted in attempts
 * and never in milliseconds, because a time limit would give a slow phone a
 * different level 52 from a fast laptop. Each attempt is one fresh solution
 * grid plus one pass of clue removal. Easy bands succeed on the first attempt
 * almost always; the required-tier bands are a lottery whose odds were
 * measured with tools/bench.mjs, and the numbers below are what that bench
 * said was worth paying — see the note beside each.
 *
 * FREE ROAM uses the same bands: paws p (1-based) on a board of size s are
 * tier p-1, and freeBand(s, tier) is the one trail band with that size and
 * tier. Every size has exactly one band per tier, so the mapping is total.
 *
 * Bands and band objects are frozen. Change a band and every puzzle in it
 * changes on every device (a run in progress is safe: the shell stores the
 * whole puzzle, DESIGN §5), so bump nothing casually.
 */

/*
 * Clues are [min, max]; minAvail 0 means "no floor". Measured 2026-10-10
 * with tools/bench.mjs (per-attempt hit rate, Node on the dev Mac):
 *   6-t3  ~0.5% of attempts need pointing — 6×6 singles are strong — at
 *         ~0.3 ms each, so 800 attempts: typical 30–60 ms, worst ~250 ms.
 *   9-t3  ~10%, 9-t4 ~4.5%, 9-t6 ~5.5% — cheap, budgets give >99% hits.
 *   9-t5  ~1%: X-wing and triples are rarer than XY-wing/swordfish because
 *         a board stuck at T4 usually offers a wing first. 600 attempts at
 *         ~1.4 ms: typical 250–450 ms, worst ~850 ms; a miss is reported
 *         honestly as the graded tier (T4).
 * DESIGN §2 asked for 22–27 / 22–26 clues at T5/T6. Boards that are minimal
 * under a 180° symmetric, logic-solvable removal come out at 24–32 clues
 * whatever their tier, so those ranges were unreachable and every attempt
 * "missed" on clue count alone; T3–T6 now share 24/26–32. The non-required
 * bands spend up to 8 cheap attempts looking for a board that actually uses
 * their tier (on 4×4 none ever does — box singles always suffice).
 */
const BANDS_RAW = [
  // id      levels    size skin       tier req    clues     minAvail sym   attempts
  ["4-t0", [1, 5], 4, "animals", 0, false, [10, 12], 3, false, 8],
  ["4-t1", [6, 10], 4, "animals", 1, false, [7, 9], 2, false, 8],
  ["4-t2", [11, 14], 4, "animals", 2, false, [5, 6], 1, false, 8],
  ["6-t0", [15, 20], 6, "animals", 0, false, [20, 24], 4, false, 8],
  ["6-t1", [21, 26], 6, "animals", 1, false, [15, 18], 2, false, 8],
  ["6-t2", [27, 30], 6, "numbers", 2, false, [12, 14], 1, false, 8],
  ["6-t3", [31, 34], 6, "numbers", 3, true, [9, 12], 1, false, 800],
  ["9-t0", [35, 38], 9, "numbers", 0, false, [45, 50], 5, true, 8],
  ["9-t1", [39, 42], 9, "numbers", 1, false, [36, 42], 3, true, 8],
  ["9-t2", [43, 46], 9, "numbers", 2, false, [30, 35], 2, true, 8],
  ["9-t3", [47, 50], 9, "numbers", 3, true, [26, 32], 1, true, 60],
  ["9-t4", [51, 54], 9, "numbers", 4, true, [24, 32], 0, true, 150],
  ["9-t5", [55, 57], 9, "numbers", 5, true, [24, 32], 0, true, 600],
  ["9-t6", [58, 60], 9, "numbers", 6, true, [24, 32], 0, true, 100],
];

export const BANDS = Object.freeze(
  BANDS_RAW.map(([id, levels, size, skin, tier, required, clues, minAvail, sym, attempts]) =>
    Object.freeze({
      id,
      levels: Object.freeze(levels),
      size,
      skin,
      tier,
      required,
      clues: Object.freeze(clues),
      minAvail,
      sym,
      attempts,
    }),
  ),
);

export const LEVEL_COUNT = 60;
export const FREE_TIERS = Object.freeze({ 4: 3, 6: 4, 9: 7 });

/* 1-based level → { level, size, skin, tier, band }, or null if out of range. */
export function levelInfo(level) {
  const n = Number(level);
  if (!Number.isInteger(n) || n < 1 || n > LEVEL_COUNT) return null;
  const band = BANDS.find((b) => n >= b.levels[0] && n <= b.levels[1]);
  return { level: n, size: band.size, skin: band.skin, tier: band.tier, band };
}

/* The band free roam uses for a board size and a tier (0-based). */
export function freeBand(size, tier) {
  return BANDS.find((b) => b.size === size && b.tier === tier) || null;
}

/* Paws (1..FREE_TIERS[size]) → tier (0-based). */
export const pawsToTier = (paws) => paws - 1;

/*
 * THE TUTORIAL — three hand-built 4×4 boards, one rule each, learned by doing
 * (DESIGN §1). Digits only; the UI draws them as animals. Each is built so
 * that at the start ONLY its own rule finds a move:
 *   rows  — every row is missing exactly one animal, while the columns and
 *           boxes with gaps each have two, so a column or box cannot finish
 *           itself yet. (A child who already knows the trick can still
 *           finish; the point is the first move is a row.)
 *   cols  — every column missing one, rows and boxes with gaps missing two.
 *   boxes — the four corners are empty, so every box is missing one and
 *           every row and column with a gap is missing two. The first move
 *           has to be a box; after that rows and columns join in.
 * tests/engine.test.mjs checks the solutions are valid, the givens unique,
 * and the "only this rule at the start" claim.
 */
const T1_SOL = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
const T2_SOL = [2, 1, 4, 3, 4, 3, 2, 1, 1, 2, 3, 4, 3, 4, 1, 2];
const T3_SOL = [3, 4, 1, 2, 1, 2, 3, 4, 4, 3, 2, 1, 2, 1, 4, 3];

function blank(solution, cells) {
  return Object.freeze(solution.map((d, i) => (cells.includes(i) ? 0 : d)));
}

export const TUTORIAL = Object.freeze([
  Object.freeze({
    size: 4,
    rule: "rows",
    // gaps at (0,1) (1,1) (2,3) (3,3)
    givens: blank(T1_SOL, [1, 5, 11, 15]),
    solution: Object.freeze(T1_SOL),
    coach: "Every row needs one of each animal. Find the gap in a row and fill it!",
  }),
  Object.freeze({
    size: 4,
    rule: "cols",
    // gaps at (0,0) (0,1) (3,2) (3,3)
    givens: blank(T2_SOL, [0, 1, 14, 15]),
    solution: Object.freeze(T2_SOL),
    coach: "Columns go top to bottom. Every column needs one of each animal too.",
  }),
  Object.freeze({
    size: 4,
    rule: "boxes",
    // gaps in the four corners
    givens: blank(T3_SOL, [0, 3, 12, 15]),
    solution: Object.freeze(T3_SOL),
    coach: "The thick lines make boxes. Every box needs one of each animal as well!",
  }),
]);
