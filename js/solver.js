/*
 * solver.js — brute force, for the two jobs logic cannot do.
 *
 * 1. fillRandom(geo, rng): a complete, valid, random solution grid. Every
 *    puzzle starts as one of these with clues taken away.
 * 2. countSolutions(grid, geo, limit, nodeBudget): how many solutions a set of
 *    givens has, stopping at `limit` (2 is enough to say "not unique"). The
 *    generator does not need it — a puzzle the human-technique grader solves
 *    is unique by construction, because every technique is a sound deduction
 *    — but the tests use it to prove that claim rather than trust it.
 *
 * Both are the same search: bitmasks of used digits per row, column and box,
 * and at each node branch on the empty cell with the fewest options (MRV).
 * That is fast enough for a 9×9 in well under a millisecond, which is why
 * there is no dancing-links here (hub §1: don't over-engineer).
 *
 * The node budget, when given, is a count of search nodes — never wall-clock,
 * because a time limit would make results depend on the device's speed and
 * break determinism. Exceeding it returns 'unknown'.
 */

import { POP, LOWBIT } from "./grid.js";

function setup(grid, geo) {
  const { N, cells, rowOf, colOf, boxOf } = geo;
  const row = new Int32Array(N);
  const col = new Int32Array(N);
  const box = new Int32Array(N);
  const values = new Int8Array(cells);
  const empties = [];
  for (let i = 0; i < cells; i++) {
    const d = grid[i] | 0;
    if (d < 0 || d > N) return null;
    values[i] = d;
    if (!d) {
      empties.push(i);
      continue;
    }
    const b = 1 << (d - 1);
    if (row[rowOf[i]] & b || col[colOf[i]] & b || box[boxOf[i]] & b) return null;
    row[rowOf[i]] |= b;
    col[colOf[i]] |= b;
    box[boxOf[i]] |= b;
  }
  return { row, col, box, values, empties };
}

const BUDGET = { budget: true };

export function countSolutions(grid, geo, limit = 2, nodeBudget = Infinity) {
  const s = setup(grid, geo);
  if (!s) return 0; // the givens already clash
  const { row, col, box, empties } = s;
  const { all, rowOf, colOf, boxOf } = geo;
  let count = 0;
  let nodes = 0;
  const n = empties.length;
  // empties[0..depth) are filled; MRV swaps the chosen cell into position.
  function search(depth) {
    if (++nodes > nodeBudget) throw BUDGET;
    if (depth === n) {
      count++;
      return count >= limit;
    }
    let best = -1;
    let bestFree = 0;
    let bestPop = 99;
    for (let k = depth; k < n; k++) {
      const i = empties[k];
      const free = all & ~(row[rowOf[i]] | col[colOf[i]] | box[boxOf[i]]);
      const p = POP[free];
      if (p < bestPop) {
        bestPop = p;
        best = k;
        bestFree = free;
        if (p <= 1) break;
      }
    }
    if (bestPop === 0) return false;
    const i = empties[best];
    empties[best] = empties[depth];
    empties[depth] = i;
    const r = rowOf[i],
      c = colOf[i],
      b = boxOf[i];
    let free = bestFree;
    while (free) {
      const bit = free & -free;
      free ^= bit;
      row[r] |= bit;
      col[c] |= bit;
      box[b] |= bit;
      const done = search(depth + 1);
      row[r] ^= bit;
      col[c] ^= bit;
      box[b] ^= bit;
      if (done) return true;
    }
    return false;
  }
  try {
    search(0);
  } catch (e) {
    if (e === BUDGET) return "unknown";
    throw e;
  }
  return count;
}

/*
 * A random complete grid. The digit order at every node is shuffled by the
 * seeded rng, so the grid is a pure function of the rng's state. MRV keeps
 * the backtracking shallow; for these sizes it never needs a budget.
 */
export function fillRandom(geo, rng) {
  const { N, cells, all, rowOf, colOf, boxOf } = geo;
  const row = new Int32Array(N);
  const col = new Int32Array(N);
  const box = new Int32Array(N);
  const values = new Array(cells).fill(0);
  const empties = [];
  for (let i = 0; i < cells; i++) empties.push(i);
  function search(depth) {
    if (depth === cells) return true;
    let best = -1;
    let bestFree = 0;
    let bestPop = 99;
    for (let k = depth; k < cells; k++) {
      const i = empties[k];
      const free = all & ~(row[rowOf[i]] | col[colOf[i]] | box[boxOf[i]]);
      const p = POP[free];
      if (p < bestPop) {
        bestPop = p;
        best = k;
        bestFree = free;
        if (p <= 1) break;
      }
    }
    if (bestPop === 0) return false;
    const i = empties[best];
    empties[best] = empties[depth];
    empties[depth] = i;
    const digits = [];
    for (let f = bestFree; f; f &= f - 1) digits.push(LOWBIT[f & -f]);
    rng.shuffle(digits);
    const r = rowOf[i],
      c = colOf[i],
      b = boxOf[i];
    for (const k of digits) {
      const bit = 1 << k;
      row[r] |= bit;
      col[c] |= bit;
      box[b] |= bit;
      values[i] = k + 1;
      if (search(depth + 1)) return true;
      row[r] ^= bit;
      col[c] ^= bit;
      box[b] ^= bit;
      values[i] = 0;
    }
    return false;
  }
  if (!search(0)) throw new Error("zoodoku: fillRandom found no grid");
  return values;
}
