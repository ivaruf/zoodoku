/*
 * hints.js — what to say when the player presses Hint.
 *
 * nextHint(puzzle, entries) looks at the board the player actually has
 * (entries = every cell's digit, givens included, 0 for empty) and returns,
 * in this order of priority:
 *
 *   { kind:'wrong', cells }  if any entry disagrees with the solution. Logic
 *                            built on a wrong entry gives nonsense, so the
 *                            hint says "something here doesn't fit" first
 *                            (DESIGN §1). Rule conflicts are a subset of
 *                            these, so they need no separate case.
 *   null                     if the board is solved.
 *   { kind:'step', …step }   otherwise: the cheapest step any technique finds
 *                            on candidates built from the entries — not from
 *                            the player's notes, which may be wrong or empty.
 *                            Hints are not capped by the level's tier: if the
 *                            player has wandered into a state that needs more,
 *                            they still get help, but always the easiest help.
 *
 * Step fields are the DESIGN §5 Hint shape; see techniques.js for unit
 * types ('cell' and 'group' as well as the three real units) and text.args.
 *
 * TWO ADDITIONS the play lane can use:
 *   then  on a step with no placement (pointing, pairs, fish, wings): the
 *         first placement {cell, digit, technique} that follows once this
 *         step's eliminations (and any further eliminations needed) are
 *         made. It is what "Show me" can place when notes are off, so the
 *         third tier never does nothing.
 *   'reveal' technique (text key 'reveal', tier 7): a safety net that should
 *         never fire for a puzzle the generator made — a board that is a
 *         correct subset of a graded solution is always solvable by the same
 *         techniques. If it ever does, the player still gets a cell (the
 *         empty one with fewest candidates) rather than a dead button.
 */

import { geometry, POP } from "./grid.js";
import { makeState, cloneState, applyStep, findStep, MAX_TIER } from "./techniques.js";

function reveal(state, solution) {
  const { geo, values, cand } = state;
  let best = -1;
  for (let i = 0; i < geo.cells; i++) {
    if (values[i]) continue;
    if (best < 0 || POP[cand[i]] < POP[cand[best]]) best = i;
  }
  const d = solution[best];
  return {
    technique: "reveal",
    tier: MAX_TIER + 1,
    unit: { type: "cell", index: -1, cells: [best] },
    placements: [{ cell: best, digit: d }],
    eliminations: [],
    focusCells: [best],
    patternCells: [best],
    causeCells: [],
    digits: [d],
    text: { key: "reveal", args: { d, cell: best } },
  };
}

function followUp(state, step) {
  const s = cloneState(state);
  s.explain = false;
  applyStep(s, step);
  // Each pass either places or removes at least one candidate, so this is
  // bounded by the number of candidates on the board.
  for (let guard = s.geo.cells * s.geo.N; guard > 0; guard--) {
    const next = findStep(s, MAX_TIER);
    if (!next) return null;
    if (next.placements.length) return { ...next.placements[0], technique: next.technique };
    applyStep(s, next);
  }
  return null;
}

export function nextHint(puzzle, entries) {
  const geo = geometry(puzzle.size);
  const board = new Array(geo.cells);
  const wrong = [];
  let empty = 0;
  for (let i = 0; i < geo.cells; i++) {
    // A given is a given even if the caller passed 0 for it.
    const v = puzzle.givens[i] || entries[i] | 0;
    board[i] = v;
    if (!v) empty++;
    else if (v !== puzzle.solution[i]) wrong.push(i);
  }
  if (wrong.length) return { kind: "wrong", cells: wrong };
  if (!empty) return null;
  const state = makeState(board, geo, true);
  const step = findStep(state, MAX_TIER) || reveal(state, puzzle.solution);
  const hint = { kind: "step", ...step };
  if (!step.placements.length) hint.then = followUp(state, step);
  return hint;
}
