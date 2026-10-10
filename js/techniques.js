/*
 * techniques.js — the human ways to make progress on a sudoku, cheapest first.
 *
 * This file is the engine's idea of "difficulty". A puzzle's tier is the
 * hardest technique a person needs when they always reach for the easiest one
 * that works (grader.js), and a hint is the easiest technique that works on
 * the board in front of the player right now (hints.js). Both read the same
 * ordered list, so a hint can never ask for something harder than what the
 * grader decided the puzzle needs.
 *
 * THE TIERS (DESIGN §2)
 *   T0 full house, hidden single in a box   — the first thing a child sees
 *   T1 hidden single in a row or column
 *   T2 naked single                         — "what can go in THIS cell?"
 *   T3 pointing, claiming (box/line)        — first elimination-only steps
 *   T4 naked pair, hidden pair
 *   T5 naked triple, hidden triple, X-wing
 *   T6 swordfish, XY-wing
 *   The order of the list is the order of preference; within a tier it runs
 *   by weight. "weight" is the effort score a step adds (grader's `effort`).
 *
 * STATE
 *   { geo, values: Int8Array, cand: Uint16Array, empty, explain }
 *   cand[i] is the candidate mask of an empty cell (bit d-1 for digit d) and 0
 *   for a filled one. Candidates start as "what the row, column and box
 *   allow" and only ever shrink. explain=false skips building causeCells,
 *   which the grader does not need and which costs real time in a generator
 *   that grades hundreds of boards.
 *
 * STEPS — the Hint shape of DESIGN §5, minus `kind`:
 *   { technique, tier, unit:{type,index,cells}, placements:[{cell,digit}],
 *     eliminations:[{cell,digit}], focusCells, patternCells, causeCells,
 *     digits, text:{ key, args } }
 *   focusCells   where the answer lands (the placed cell, or the cells that
 *                lose a candidate)
 *   patternCells the shape that makes the deduction (the unit for a single,
 *                the pair, the fish corners)
 *   causeCells   given/entered cells whose digits force it — "this row
 *                already has a fox, a frog and a whale"
 *   unit         what a Nudge glows. Real units are the frozen geometry
 *                objects. Two deviations from 'row'|'col'|'box', because no
 *                single unit carries these deductions: type 'cell' for a
 *                naked single (cells = [the cell]) and type 'group' for
 *                X-wing, swordfish and XY-wing (cells = the pattern),
 *                both with index -1.
 *   text.args    digits as d / ds, cells as cell, units as unitType +
 *                unitIndex (0-based), pointing/claiming add lineType,
 *                lineIndex and boxIndex. The UI owns the words.
 *
 * Every finder is generic in N and in box shape: it walks geo.units and the
 * row/col/box tables, never assumes 3×3, so 2×3 boxes on a 6×6 work the same
 * way 2×2 and 3×3 do — the tests check both.
 */

import { POP, LOWBIT, maskDigits } from "./grid.js";

/* ---------- state ---------- */

export function makeState(grid, geo, explain = false) {
  const { N, cells, all, rowOf, colOf, boxOf } = geo;
  const values = new Int8Array(cells);
  const cand = new Uint16Array(cells);
  const row = new Int32Array(N);
  const col = new Int32Array(N);
  const box = new Int32Array(N);
  let broken = false;
  let empty = 0;
  for (let i = 0; i < cells; i++) {
    const d = grid[i] | 0;
    values[i] = d > 0 && d <= N ? d : 0;
    if (!values[i]) {
      empty++;
      continue;
    }
    const b = 1 << (d - 1);
    if (row[rowOf[i]] & b || col[colOf[i]] & b || box[boxOf[i]] & b) broken = true;
    row[rowOf[i]] |= b;
    col[colOf[i]] |= b;
    box[boxOf[i]] |= b;
  }
  // Empty cells per unit, kept current by place(), so full house is a
  // lookup instead of a scan of every unit on every step — it is the first
  // technique tried, so it runs more often than everything else together.
  const unitEmpty = new Int8Array(geo.units.length);
  for (let i = 0; i < cells; i++) {
    if (values[i]) continue;
    cand[i] = all & ~(row[rowOf[i]] | col[colOf[i]] | box[boxOf[i]]);
    for (const u of geo.cellUnits[i]) unitEmpty[u.uid]++;
  }
  return { geo, values, cand, unitEmpty, empty, broken, explain };
}

export function cloneState(s) {
  return {
    geo: s.geo,
    values: s.values.slice(),
    cand: s.cand.slice(),
    unitEmpty: s.unitEmpty.slice(),
    empty: s.empty,
    broken: s.broken,
    explain: s.explain,
  };
}

export function place(state, cell, digit) {
  const bit = 1 << (digit - 1);
  state.values[cell] = digit;
  state.cand[cell] = 0;
  state.empty--;
  const us = state.geo.cellUnits[cell];
  state.unitEmpty[us[0].uid]--;
  state.unitEmpty[us[1].uid]--;
  state.unitEmpty[us[2].uid]--;
  const ps = state.geo.peers[cell];
  for (let k = 0; k < ps.length; k++) state.cand[ps[k]] &= ~bit;
}

export function applyStep(state, step) {
  for (const p of step.placements) {
    if (!state.values[p.cell]) place(state, p.cell, p.digit);
  }
  for (const e of step.eliminations) state.cand[e.cell] &= ~(1 << (e.digit - 1));
}

/* ---------- helpers ---------- */

function mk(id, tier, unit, placements, eliminations, focus, pattern, cause, digits, args, key = id) {
  return {
    technique: id,
    tier,
    unit,
    placements,
    eliminations,
    focusCells: focus,
    patternCells: pattern,
    causeCells: cause,
    digits,
    text: { key, args },
  };
}

function cellUnit(cell) {
  return { type: "cell", index: -1, cells: [cell] };
}
function groupUnit(cells) {
  return { type: "group", index: -1, cells };
}

/* A filled cell holding digit d that sees cell e, or -1. */
function blockerOf(state, e, d) {
  const ps = state.geo.peers[e];
  for (let k = 0; k < ps.length; k++) if (state.values[ps[k]] === d) return ps[k];
  return -1;
}

/*
 * Why each other empty cell of `unit` cannot hold d: one filled peer per
 * blocked cell, de-duplicated. A cell ruled out by an earlier elimination
 * rather than a digit has no blocker and simply contributes nothing.
 */
function blockersInUnit(state, unit, d, except) {
  const out = [];
  for (const e of unit.cells) {
    if (e === except || state.values[e]) continue;
    const b = blockerOf(state, e, d);
    if (b >= 0 && !out.includes(b)) out.push(b);
  }
  return out;
}

const comboCache = new Map();
/* All k-subsets of 0..n-1 as index arrays, memoised (n ≤ 9, k ≤ 3). */
function combos(n, k) {
  const key = n * 16 + k;
  let hit = comboCache.get(key);
  if (!hit) comboCache.set(key, (hit = makeCombos(n, k)));
  return hit;
}
function makeCombos(n, k) {
  const out = [];
  const idx = [];
  (function rec(start) {
    if (idx.length === k) {
      out.push(idx.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      idx.push(i);
      rec(i + 1);
      idx.pop();
    }
  })(0);
  return out;
}

/* ---------- singles ---------- */

function fullHouse(state) {
  const { geo, values, cand, unitEmpty } = state;
  for (let uid = 0; uid < unitEmpty.length; uid++) {
    if (unitEmpty[uid] !== 1) continue;
    const u = geo.units[uid];
    const cs = u.cells;
    let cell = -1;
    let placed = 0;
    for (let k = 0; k < cs.length; k++) {
      const v = values[cs[k]];
      if (v) placed |= 1 << (v - 1);
      else cell = cs[k];
    }
    const m = geo.all & ~placed;
    if (!(cand[cell] & m)) continue; // contradiction: leave it for the caller to get stuck on
    const d = LOWBIT[m] + 1;
    const cause = state.explain ? cs.filter((c) => c !== cell) : [];
    return mk("full_house", 0, u, [{ cell, digit: d }], [], [cell], cs, cause, [d], {
      d,
      cell,
      unitType: u.type,
      unitIndex: u.index,
    });
  }
  return null;
}

function hiddenSingleIn(state, units, id, tier) {
  const { cand } = state;
  for (const u of units) {
    const cs = u.cells;
    let once = 0;
    let twice = 0;
    for (let k = 0; k < cs.length; k++) {
      const m = cand[cs[k]];
      twice |= once & m;
      once |= m;
    }
    const hs = once & ~twice;
    if (!hs) continue;
    const bit = hs & -hs;
    const d = LOWBIT[bit] + 1;
    let cell = -1;
    for (let k = 0; k < cs.length; k++) if (cand[cs[k]] & bit) cell = cs[k];
    const cause = state.explain ? blockersInUnit(state, u, d, cell) : [];
    return mk(id, tier, u, [{ cell, digit: d }], [], [cell], cs, cause, [d], {
      d,
      cell,
      unitType: u.type,
      unitIndex: u.index,
    });
  }
  return null;
}

function hiddenSingleBox(state) {
  return hiddenSingleIn(state, state.geo.boxes, "hidden_single_box", 0);
}
function hiddenSingleLine(state) {
  return (
    hiddenSingleIn(state, state.geo.rows, "hidden_single_line", 1) ||
    hiddenSingleIn(state, state.geo.cols, "hidden_single_line", 1)
  );
}

function nakedSingle(state) {
  const { geo, values, cand } = state;
  for (let c = 0; c < geo.cells; c++) {
    if (values[c] || POP[cand[c]] !== 1) continue;
    const d = LOWBIT[cand[c]] + 1;
    const cause = [];
    if (state.explain) {
      for (let o = 1; o <= geo.N; o++) {
        if (o === d) continue;
        const b = blockerOf(state, c, o);
        if (b >= 0 && !cause.includes(b)) cause.push(b);
      }
    }
    return mk("naked_single", 2, cellUnit(c), [{ cell: c, digit: d }], [], [c], [c], cause, [d], {
      d,
      cell: c,
    });
  }
  return null;
}

/* ---------- box/line interactions ---------- */

// Scratch for the box/line scans: per digit, which rows / columns / boxes
// hold a candidate and how many cells. Module-level and reused, because these
// two finders run at every stuck state of every grade in the generator.
const S_ROWS = new Int32Array(9);
const S_COLS = new Int32Array(9);
const S_N = new Int32Array(9);

// Pointing: within a box, every place for d lies on one line, so d leaves
// the rest of that line.
function pointing(state) {
  const { geo, cand } = state;
  const { rowOf, colOf, N } = geo;
  for (const u of geo.boxes) {
    S_ROWS.fill(0);
    S_COLS.fill(0);
    S_N.fill(0);
    for (const i of u.cells) {
      for (let m = cand[i]; m; m &= m - 1) {
        const k = LOWBIT[m & -m];
        S_ROWS[k] |= 1 << rowOf[i];
        S_COLS[k] |= 1 << colOf[i];
        S_N[k]++;
      }
    }
    for (let k = 0; k < N; k++) {
      if (S_N[k] < 2) continue;
      const bit = 1 << k;
      for (let pass = 0; pass < 2; pass++) {
        const byRow = pass === 0;
        const lines = byRow ? S_ROWS[k] : S_COLS[k];
        if (POP[lines] !== 1) continue;
        const lineIndex = LOWBIT[lines];
        const line = byRow ? geo.rows[lineIndex] : geo.cols[lineIndex];
        const elim = line.cells.filter((i) => geo.boxOf[i] !== u.index && cand[i] & bit);
        if (!elim.length) continue;
        const d = k + 1;
        const pattern = u.cells.filter((i) => cand[i] & bit);
        return mk(
          "pointing",
          3,
          u,
          [],
          elim.map((cell) => ({ cell, digit: d })),
          elim,
          pattern,
          state.explain ? blockersInUnit(state, u, d, -1) : [],
          [d],
          { d, unitType: "box", unitIndex: u.index, boxIndex: u.index, lineType: byRow ? "row" : "col", lineIndex },
        );
      }
    }
  }
  return null;
}

// Claiming (box/line reduction): within a line, every place for d lies in one
// box, so d leaves the rest of that box.
function claiming(state) {
  const { geo, cand } = state;
  const { boxOf, N } = geo;
  for (let li = 0; li < 2 * N; li++) {
    const u = li < N ? geo.rows[li] : geo.cols[li - N];
    S_ROWS.fill(0); // reused here as "which boxes"
    S_N.fill(0);
    for (const i of u.cells) {
      for (let m = cand[i]; m; m &= m - 1) {
        const k = LOWBIT[m & -m];
        S_ROWS[k] |= 1 << boxOf[i];
        S_N[k]++;
      }
    }
    for (let k = 0; k < N; k++) {
      if (S_N[k] < 2 || POP[S_ROWS[k]] !== 1) continue;
      const bit = 1 << k;
      const b = LOWBIT[S_ROWS[k]];
      const elim = geo.boxes[b].cells.filter((i) => !u.cells.includes(i) && cand[i] & bit);
      if (!elim.length) continue;
      const d = k + 1;
      const pattern = u.cells.filter((i) => cand[i] & bit);
      return mk(
        "claiming",
        3,
        u,
        [],
        elim.map((cell) => ({ cell, digit: d })),
        elim,
        pattern,
        state.explain ? blockersInUnit(state, u, d, -1) : [],
        [d],
        { d, unitType: u.type, unitIndex: u.index, lineType: u.type, lineIndex: u.index, boxIndex: b },
      );
    }
  }
  return null;
}

/* ---------- subsets ---------- */

const S_POOL = new Int32Array(9);

function nakedSubset(state, k, id, tier) {
  const { geo, values, cand } = state;
  for (const u of geo.units) {
    const cs = u.cells;
    // Cheap precheck without allocating: more than k empty cells, and at
    // least k of them small enough to be part of the subset.
    let nEmpty = 0;
    let nPool = 0;
    for (let j = 0; j < cs.length; j++) {
      const i = cs[j];
      if (values[i]) continue;
      nEmpty++;
      const p = POP[cand[i]];
      if (p >= 2 && p <= k) S_POOL[nPool++] = i;
    }
    if (nEmpty <= k || nPool < k) continue;
    for (const combo of combos(nPool, k)) {
      let union = 0;
      for (let j = 0; j < k; j++) union |= cand[S_POOL[combo[j]]];
      if (POP[union] !== k) continue;
      const chosen = combo.map((j) => S_POOL[j]);
      const elim = [];
      for (const i of cs) {
        if (values[i] || chosen.includes(i)) continue;
        const hit = cand[i] & union;
        for (const d of maskDigits(hit)) elim.push({ cell: i, digit: d });
      }
      if (!elim.length) continue;
      const ds = maskDigits(union);
      return mk(
        id,
        tier,
        u,
        [],
        elim,
        [...new Set(elim.map((e) => e.cell))],
        chosen,
        [],
        ds,
        { ds, cells: chosen, unitType: u.type, unitIndex: u.index },
      );
    }
  }
  return null;
}

function hiddenSubset(state, k, id, tier) {
  const { geo, cand } = state;
  const N = geo.N;
  for (const u of geo.units) {
    const cs = u.cells;
    const pos = new Array(N).fill(0);
    let emptyCount = 0;
    for (let j = 0; j < cs.length; j++) {
      const m = cand[cs[j]];
      if (m) emptyCount++;
      for (let x = m; x; x &= x - 1) pos[LOWBIT[x & -x]] |= 1 << j;
    }
    if (emptyCount <= k) continue;
    const pool = [];
    for (let d = 0; d < N; d++) if (POP[pos[d]] >= 2 && POP[pos[d]] <= k) pool.push(d);
    if (pool.length < k) continue;
    for (const combo of combos(pool.length, k)) {
      let where = 0;
      let dmask = 0;
      for (const j of combo) {
        where |= pos[pool[j]];
        dmask |= 1 << pool[j];
      }
      if (POP[where] !== k) continue;
      const chosen = [];
      const elim = [];
      for (let j = 0; j < cs.length; j++) {
        if (!(where & (1 << j))) continue;
        chosen.push(cs[j]);
        for (const d of maskDigits(cand[cs[j]] & ~dmask)) elim.push({ cell: cs[j], digit: d });
      }
      if (!elim.length) continue;
      const ds = maskDigits(dmask);
      return mk(id, tier, u, [], elim, chosen, chosen, [], ds, {
        ds,
        cells: chosen,
        unitType: u.type,
        unitIndex: u.index,
      });
    }
  }
  return null;
}

/* ---------- fish ---------- */

// k = 2 X-wing, k = 3 swordfish. For digit d, k base lines whose places for
// d all fall in the same k cover lines: d leaves those cover lines elsewhere.
function fish(state, k, id, tier) {
  const { geo, cand } = state;
  const N = geo.N;
  for (let x = 0; x < N; x++) {
    const bit = 1 << x;
    for (const byRow of [true, false]) {
      const masks = new Array(N).fill(0);
      for (let a = 0; a < N; a++) {
        for (let b = 0; b < N; b++) {
          const i = byRow ? a * N + b : b * N + a;
          if (cand[i] & bit) masks[a] |= 1 << b;
        }
      }
      const pool = [];
      for (let a = 0; a < N; a++) if (POP[masks[a]] >= 2 && POP[masks[a]] <= k) pool.push(a);
      if (pool.length < k) continue;
      for (const combo of combos(pool.length, k)) {
        let union = 0;
        for (const j of combo) union |= masks[pool[j]];
        if (POP[union] !== k) continue;
        const base = combo.map((j) => pool[j]);
        const elim = [];
        const pattern = [];
        for (let a = 0; a < N; a++) {
          for (let b = 0; b < N; b++) {
            if (!(union & (1 << b))) continue;
            const i = byRow ? a * N + b : b * N + a;
            if (!(cand[i] & bit)) continue;
            if (base.includes(a)) pattern.push(i);
            else elim.push(i);
          }
        }
        if (!elim.length) continue;
        const d = x + 1;
        return mk(
          id,
          tier,
          groupUnit(pattern),
          [],
          elim.map((cell) => ({ cell, digit: d })),
          elim,
          pattern,
          [],
          [d],
          { d, lineType: byRow ? "row" : "col", lines: base, cover: maskDigits(union).map((v) => v - 1) },
        );
      }
    }
  }
  return null;
}

/* ---------- wings ---------- */

// XY-wing: a pivot {x,y} sees a wing {x,z} and a wing {y,z}. Whichever the
// pivot is, one wing is z — so z leaves every cell that sees both wings.
function xyWing(state) {
  const { geo, cand } = state;
  for (let p = 0; p < geo.cells; p++) {
    const m = cand[p];
    if (POP[m] !== 2) continue;
    const x = m & -m;
    const y = m ^ x;
    const wings = geo.peers[p].filter((i) => POP[cand[i]] === 2 && POP[cand[i] & m] === 1);
    for (const a of wings) {
      if (!(cand[a] & x)) continue;
      const z = cand[a] ^ x;
      for (const b of wings) {
        if (cand[b] !== (y | z)) continue;
        const elim = geo.peers[a].filter((i) => i !== b && i !== p && geo.isPeer(b, i) && cand[i] & z);
        if (!elim.length) continue;
        const d = LOWBIT[z] + 1;
        const pattern = [p, a, b];
        return mk(
          "xy_wing",
          6,
          groupUnit(pattern),
          [],
          elim.map((cell) => ({ cell, digit: d })),
          elim,
          pattern,
          [],
          [LOWBIT[x] + 1, LOWBIT[y] + 1, d],
          { d, pivot: p, wings: [a, b], ds: [LOWBIT[x] + 1, LOWBIT[y] + 1, d] },
        );
      }
    }
  }
  return null;
}

/* ---------- the list ---------- */

export const TECHNIQUES = Object.freeze(
  [
    { id: "full_house", tier: 0, weight: 1, find: fullHouse },
    { id: "hidden_single_box", tier: 0, weight: 2, find: hiddenSingleBox },
    { id: "hidden_single_line", tier: 1, weight: 3, find: hiddenSingleLine },
    { id: "naked_single", tier: 2, weight: 4, find: nakedSingle },
    { id: "pointing", tier: 3, weight: 6, find: pointing },
    { id: "claiming", tier: 3, weight: 7, find: claiming },
    { id: "naked_pair", tier: 4, weight: 10, find: (s) => nakedSubset(s, 2, "naked_pair", 4) },
    { id: "hidden_pair", tier: 4, weight: 12, find: (s) => hiddenSubset(s, 2, "hidden_pair", 4) },
    { id: "naked_triple", tier: 5, weight: 18, find: (s) => nakedSubset(s, 3, "naked_triple", 5) },
    { id: "hidden_triple", tier: 5, weight: 20, find: (s) => hiddenSubset(s, 3, "hidden_triple", 5) },
    { id: "x_wing", tier: 5, weight: 20, find: (s) => fish(s, 2, "x_wing", 5) },
    { id: "xy_wing", tier: 6, weight: 30, find: xyWing },
    { id: "swordfish", tier: 6, weight: 35, find: (s) => fish(s, 3, "swordfish", 6) },
  ].map((t) => Object.freeze(t)),
);

export const MAX_TIER = 6;
export const WEIGHT = Object.freeze(Object.fromEntries(TECHNIQUES.map((t) => [t.id, t.weight])));

const upTo = [];
export function techniquesUpTo(maxTier) {
  const t = Math.max(0, Math.min(MAX_TIER, maxTier | 0));
  return (upTo[t] ||= Object.freeze(TECHNIQUES.filter((x) => x.tier <= t)));
}

/* The first step any allowed technique finds, cheapest first, or null. */
export function findStep(state, maxTier = MAX_TIER) {
  for (const t of techniquesUpTo(maxTier)) {
    const s = t.find(state);
    if (s) return s;
  }
  return null;
}

/*
 * How many distinct cells could be filled right now by a single the cap
 * allows: full house in any unit and hidden single in a box (T0), hidden
 * single in any unit (T1), naked single (T2). This is the "how many doors
 * are open" number behind minAvail — a board where the only move is one
 * hidden cell feels like a wall to a seven-year-old even if it is "easy".
 */
export function countAvail(state, maxTier) {
  const { geo, values, cand } = state;
  const cap = Math.min(maxTier, 2);
  const mark = (state._mark ||= new Uint8Array(geo.cells));
  mark.fill(0);
  let count = 0;
  for (const u of geo.units) {
    const cs = u.cells;
    let once = 0;
    let twice = 0;
    let n = 0;
    let last = -1;
    for (let k = 0; k < cs.length; k++) {
      const c = cs[k];
      if (values[c]) continue;
      n++;
      last = c;
      const m = cand[c];
      twice |= once & m;
      once |= m;
    }
    if (n === 1 && cand[last] && !mark[last]) {
      mark[last] = 1;
      count++;
    }
    if (u.type === "box" || cap >= 1) {
      for (let hs = once & ~twice; hs; hs &= hs - 1) {
        const bit = hs & -hs;
        for (let k = 0; k < cs.length; k++) {
          const c = cs[k];
          if (cand[c] & bit) {
            if (!mark[c]) {
              mark[c] = 1;
              count++;
            }
            break;
          }
        }
      }
    }
  }
  if (cap >= 2) {
    for (let c = 0; c < geo.cells; c++) {
      if (!values[c] && POP[cand[c]] === 1 && !mark[c]) {
        mark[c] = 1;
        count++;
      }
    }
  }
  return count;
}
