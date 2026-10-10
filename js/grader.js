/*
 * grader.js — solve a board the way a person would, and say how hard that was.
 *
 * logicSolve(givens, geo, maxTier, opts) runs the technique list from the
 * cheapest entry, applies the first step anything finds, and starts again
 * from the cheapest — always. That restart is the whole definition of tier:
 * a puzzle is T3 if a solver who always reaches for the easiest thing that
 * works needs pointing at least once. Because the step chosen at every state
 * is the same whether the cap is T3 or T6 (the cheap techniques are tried
 * first either way), "graded maxTier = t" and "not solvable at t-1" are the
 * same statement, so the generator gets the real tier from one solve.
 *
 * RESULT
 *   { solved, maxTier, effort, minAvail, avgAvail, steps, values, trace? }
 *   maxTier  hardest tier actually used (-1 if nothing was needed)
 *   effort   sum of technique weights over every step taken
 *   minAvail fewest cells a single (within the cap) could fill, over the
 *            states where a single was possible at all but not every empty
 *            cell was open. States that needed an elimination step have zero
 *            singles by definition and are left out, so a T3 puzzle is not
 *            reported as minAvail 0 merely for being T3; states where every
 *            hole is fillable are left out because the endgame would
 *            otherwise always report 1. Infinity when nothing was measured.
 *   avgAvail mean of the same numbers
 *   steps    how many steps were applied (trace holds them when asked)
 *   values   the final grid — the generator checks it against the solution,
 *            which catches an unsound technique instead of shipping it
 *
 * OPTIONS
 *   avail     measure availability (default true)
 *   minAvail  give up as soon as availability drops below this — the
 *             generator's early exit, since such a board will be rejected
 *   explain   build causeCells on each step (hints want it; grading does not)
 *   trace     keep the list of steps
 */

import { makeState, applyStep, findStep, countAvail, MAX_TIER, WEIGHT } from "./techniques.js";

export function logicSolve(givens, geo, maxTier = MAX_TIER, opts = {}) {
  const { avail = true, minAvail: floor = 0, explain = false, trace = false } = opts;
  const state = makeState(givens, geo, explain);
  const out = {
    solved: false,
    maxTier: -1,
    effort: 0,
    minAvail: Infinity,
    avgAvail: 0,
    steps: 0,
    values: state.values,
  };
  if (trace) out.trace = [];
  if (state.broken) return out;
  const capSingles = Math.min(maxTier, 2);
  let availSum = 0;
  let availN = 0;
  while (state.empty > 0) {
    if (avail) {
      const a = countAvail(state, capSingles);
      // A state where every empty cell is already open is not a constraint
      // (a board with two holes cannot offer three doors), so only states
      // with some cell still shut are measured.
      if (a > 0 && a < state.empty) {
        if (a < out.minAvail) out.minAvail = a;
        availSum += a;
        availN++;
        if (a < floor) break;
      }
    }
    const step = findStep(state, maxTier);
    if (!step) break;
    applyStep(state, step);
    out.steps++;
    out.effort += WEIGHT[step.technique];
    if (step.tier > out.maxTier) out.maxTier = step.tier;
    if (trace) out.trace.push(step);
    // A candidate wiped out means the givens contradict themselves.
    if (step.eliminations.length && step.eliminations.some((e) => !state.values[e.cell] && !state.cand[e.cell])) break;
  }
  out.solved = state.empty === 0;
  out.avgAvail = availN ? availSum / availN : 0;
  return out;
}
