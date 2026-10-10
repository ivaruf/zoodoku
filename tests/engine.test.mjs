/*
 * engine.test.mjs — the engine lane's committed test (DESIGN §7).
 *
 *   node --test tests/
 *
 * What it proves, and why each matters:
 *   - geometry is right for all three shapes, 2×3 boxes included;
 *   - the rng and the generator are deterministic per seed string — the
 *     "level 23 is level 23 everywhere" promise;
 *   - every technique's every step is SOUND (never places a wrong digit,
 *     never removes the right one) across many boards of every size, and
 *     the box-shaped ones and the fish/wings fire on hand-built 6×6 and 4×4
 *     states, so they are not just 9×9 code that happens to compile;
 *   - all sixty trail levels and every free-roam band produce boards that
 *     are unique by brute force, solved within their band's tier, and —
 *     where the band requires its tier and the generator says it hit —
 *     not solvable one tier below;
 *   - a hint on a fresh board is a real step whose placement is the
 *     solution's, and repeated hints alone solve a hard 9×9;
 *   - the tutorial boards are valid, unique, and open with their own rule.
 * It runs the whole trail once, so it takes a few seconds.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { makeRng } from "../js/rng.js";
import { geometry } from "../js/grid.js";
import { countSolutions, fillRandom } from "../js/solver.js";
import { makeState, applyStep, findStep, TECHNIQUES, MAX_TIER } from "../js/techniques.js";
import { logicSolve } from "../js/grader.js";
import { generate } from "../js/generator.js";
import { BANDS, LEVEL_COUNT, FREE_TIERS, TUTORIAL, levelInfo, freeBand } from "../js/levels.js";
import { nextHint } from "../js/hints.js";
import { getPuzzle, buildPuzzle, seedFor } from "../js/engine.js";

const tech = (id) => TECHNIQUES.find((t) => t.id === id);

function validSolution(grid, geo) {
  return geo.units.every((u) => {
    const seen = new Set(u.cells.map((i) => grid[i]));
    return seen.size === geo.N && [...seen].every((d) => d >= 1 && d <= geo.N);
  });
}

test("geometry: shapes, units, peers", () => {
  for (const [size, bh, bw, peers] of [
    [4, 2, 2, 7],
    [6, 2, 3, 12],
    [9, 3, 3, 20],
  ]) {
    const g = geometry(size);
    assert.equal(g.N, size);
    assert.equal(g.bh, bh);
    assert.equal(g.bw, bw);
    assert.equal(g.units.length, 3 * size);
    for (const u of g.units) assert.equal(u.cells.length, size);
    for (let i = 0; i < g.cells; i++) assert.equal(g.peers[i].length, peers);
    assert.equal(geometry(size), g, "memoised");
    assert.ok(Object.isFrozen(g) && Object.isFrozen(g.units[0].cells));
  }
  // A 6×6 box is 2 rows × 3 columns: cells (0,0..2) and (1,0..2).
  assert.deepEqual([...geometry(6).boxes[0].cells], [0, 1, 2, 6, 7, 8]);
  assert.deepEqual([...geometry(6).boxes[1].cells], [3, 4, 5, 9, 10, 11]);
});

test("rng: same seed, same stream; different seed, different stream", () => {
  const a = makeRng("zoodoku");
  const b = makeRng("zoodoku");
  const c = makeRng("zoodoku!");
  const sa = Array.from({ length: 20 }, () => a.int(1000));
  const sb = Array.from({ length: 20 }, () => b.int(1000));
  const sc = Array.from({ length: 20 }, () => c.int(1000));
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
});

test("solver: counts and fills", () => {
  assert.equal(countSolutions(new Array(16).fill(0), geometry(4), 1000), 288);
  assert.equal(countSolutions(new Array(81).fill(0), geometry(9), 2), 2);
  assert.equal(countSolutions(new Array(81).fill(0), geometry(9), 1e9, 50), "unknown");
  for (const size of [4, 6, 9]) {
    const g = geometry(size);
    const s = fillRandom(g, makeRng(`fill-${size}`));
    assert.ok(validSolution(s, g));
    assert.deepEqual(s, fillRandom(g, makeRng(`fill-${size}`)));
  }
});

test("techniques: box-shaped steps on a 6×6 respect 2×3 boxes", () => {
  const g = geometry(6);
  const empty = new Array(36).fill(0);
  // Digit 1 only on row 0 inside box 0 → pointing clears row 0 outside it.
  let s = makeState(empty, g);
  for (const i of g.boxes[0].cells) if (g.rowOf[i] !== 0) s.cand[i] &= ~1;
  let step = tech("pointing").find(s);
  assert.equal(step.technique, "pointing");
  assert.deepEqual(step.eliminations.map((e) => e.cell).sort((a, b) => a - b), [3, 4, 5]);
  // Digit 1 only in column 0 inside box 0 (two cells) → clears column 0 below.
  s = makeState(empty, g);
  for (const i of g.boxes[0].cells) if (g.colOf[i] !== 0) s.cand[i] &= ~1;
  step = tech("pointing").find(s);
  assert.deepEqual(step.eliminations.map((e) => e.cell).sort((a, b) => a - b), [12, 18, 24, 30]);
  // Digit 1 in row 0 only within box 0 → claiming clears the rest of box 0.
  s = makeState(empty, g);
  for (const i of g.rows[0].cells) if (g.boxOf[i] !== 0) s.cand[i] &= ~1;
  step = tech("claiming").find(s);
  assert.deepEqual(step.eliminations.map((e) => e.cell).sort((a, b) => a - b), [6, 7, 8]);
});

test("techniques: fish and wings work at N=6 and N=4", () => {
  const g = geometry(6);
  const s = makeState(new Array(36).fill(0), g);
  // Digit 2 in rows 0 and 3 only at columns 1 and 4 → X-wing.
  for (const r of [0, 3]) for (let c = 0; c < 6; c++) if (c !== 1 && c !== 4) s.cand[r * 6 + c] &= ~2;
  const x = tech("x_wing").find(s);
  assert.equal(x.digits[0], 2);
  assert.equal(x.eliminations.length, 8);
  assert.ok(x.eliminations.every((e) => (e.cell % 6 === 1 || e.cell % 6 === 4) && ![0, 3].includes(Math.floor(e.cell / 6))));
  // Swordfish on digit 3, rows 0, 2, 4 confined to columns 0, 3, 5.
  const s2 = makeState(new Array(36).fill(0), g);
  const cover = { 0: [0, 3], 2: [3, 5], 4: [0, 5] };
  for (const r of [0, 2, 4]) for (let c = 0; c < 6; c++) if (!cover[r].includes(c)) s2.cand[r * 6 + c] &= ~4;
  const sw = tech("swordfish").find(s2);
  assert.equal(sw.digits[0], 3);
  assert.ok(sw.eliminations.every((e) => [0, 3, 5].includes(e.cell % 6) && [1, 3, 5].includes(Math.floor(e.cell / 6))));
  assert.equal(sw.eliminations.length, 9);
  // XY-wing on a 4×4: pivot (0,0)={1,2}, wings (0,3)={1,3} and (3,0)={2,3}
  // → 3 leaves (3,3), which sees both wings.
  const g4 = geometry(4);
  const s4 = makeState(new Array(16).fill(0), g4);
  s4.cand[0] = 0b0011;
  s4.cand[3] = 0b0101;
  s4.cand[12] = 0b0110;
  const w = tech("xy_wing").find(s4);
  assert.deepEqual(w.eliminations, [{ cell: 15, digit: 3 }]);
});

test("techniques: naked and hidden triples", () => {
  const g = geometry(9);
  const s = makeState(new Array(81).fill(0), g);
  s.cand[0] = 0b011;
  s.cand[1] = 0b110;
  s.cand[2] = 0b101;
  const nt = tech("naked_triple").find(s);
  assert.deepEqual(nt.digits, [1, 2, 3]);
  assert.equal(nt.unit.type, "row");
  assert.equal(nt.eliminations.length, 18);
  assert.ok(nt.eliminations.every((e) => e.cell >= 3 && e.cell <= 8));
  const h = makeState(new Array(81).fill(0), g);
  for (let c = 3; c < 9; c++) h.cand[c] &= ~0b111;
  const ht = tech("hidden_triple").find(h);
  assert.deepEqual(ht.digits, [1, 2, 3]);
  assert.deepEqual(ht.patternCells, [0, 1, 2]);
  assert.equal(ht.eliminations.length, 18); // 4..9 out of each of three cells
});

/* Grade with a trace and check every step against the solution. */
function assertSound(givens, solution, geo, seen) {
  const r = logicSolve(givens, geo, MAX_TIER, { trace: true });
  const s = makeState(givens, geo);
  for (const step of r.trace) {
    seen.add(step.technique);
    for (const p of step.placements) assert.equal(p.digit, solution[p.cell], `${step.technique} placed wrong`);
    for (const e of step.eliminations) assert.notEqual(e.digit, solution[e.cell], `${step.technique} removed the answer`);
    applyStep(s, step);
  }
  return r;
}

test("techniques: every step is sound across many boards of every size", () => {
  const seen = new Set();
  for (const size of [4, 6, 9]) {
    const geo = geometry(size);
    const band = { size, tier: MAX_TIER, required: false, clues: [0, 81], minAvail: 0, sym: size === 9, attempts: 1 };
    const n = size === 9 ? 150 : 80;
    for (let i = 0; i < n; i++) {
      const g = generate(`sound-${size}-${i}`, band, geo);
      const r = assertSound(g.givens, g.solution, geo, seen);
      assert.ok(r.solved);
    }
  }
  // Coverage is deterministic (fixed seeds), so this is a fact, not a hope.
  for (const id of ["full_house", "hidden_single_box", "hidden_single_line", "naked_single", "pointing", "claiming", "naked_pair", "hidden_pair", "xy_wing"]) {
    assert.ok(seen.has(id), `${id} never fired`);
  }
});

const trail = new Map();
function trailPuzzle(level) {
  if (!trail.has(level)) trail.set(level, buildPuzzle({ kind: "trail", level }));
  return trail.get(level);
}

test("trail: all 60 levels are unique, valid and within their tier", () => {
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    const info = levelInfo(level);
    const pz = trailPuzzle(level);
    const geo = geometry(pz.size);
    assert.equal(pz.id, `zoodoku-v1-trail-${level}`);
    assert.equal(pz.size, info.size);
    assert.ok(validSolution(pz.solution, geo), `level ${level} solution`);
    pz.givens.forEach((d, i) => assert.ok(d === 0 || d === pz.solution[i]));
    assert.equal(countSolutions(pz.givens, geo, 2), 1, `level ${level} unique`);
    const r = logicSolve(pz.givens, geo, info.tier);
    assert.ok(r.solved, `level ${level} solvable at T${info.tier}`);
    assert.equal(Math.max(0, r.maxTier), pz.tier, `level ${level} graded tier`);
    assert.ok(pz.tier <= info.tier);
    const band = info.band;
    if (pz.hit) {
      assert.ok(pz.clues >= band.clues[0] && pz.clues <= band.clues[1], `level ${level} clues ${pz.clues}`);
      if (band.required) {
        assert.equal(pz.tier, band.tier);
        assert.ok(!logicSolve(pz.givens, geo, band.tier - 1).solved, `level ${level} too easy`);
      }
    }
    if (band.minAvail > 1) assert.ok(r.minAvail >= band.minAvail, `level ${level} minAvail`);
    // Step-by-step soundness on the real trail too, which is where the
    // rare techniques (triples, swordfish) actually turn up.
    assertSound(pz.givens, pz.solution, geo, new Set());
    if (band.sym) pz.givens.forEach((d, i) => assert.equal(!d, !pz.givens[geo.cells - 1 - i]));
    assert.equal(pz.notes, pz.size === 9 || info.tier >= 3);
  }
});

test("free roam: every size and paw level builds a valid, unique board", () => {
  for (const size of [4, 6, 9]) {
    for (let tier = 0; tier < FREE_TIERS[size]; tier++) {
      assert.ok(freeBand(size, tier), `band for ${size}/${tier}`);
      const pz = buildPuzzle({ kind: "free", size, tier, n: 1 });
      const geo = geometry(size);
      assert.equal(pz.id, `zoodoku-v1-free-${size}-${tier}-1`);
      assert.equal(countSolutions(pz.givens, geo, 2), 1);
      assert.ok(logicSolve(pz.givens, geo, tier).solved);
    }
  }
});

test("determinism: same spec, same puzzle", () => {
  for (const spec of [
    { kind: "trail", level: 3 },
    { kind: "trail", level: 33 },
    { kind: "trail", level: 52 },
    { kind: "free", size: 9, tier: 6, n: 4 },
    { kind: "free", size: 6, tier: 1, n: 0 },
  ]) {
    const a = buildPuzzle(spec);
    const b = buildPuzzle(spec);
    assert.deepEqual(a, b, seedFor(spec));
  }
  assert.notDeepEqual(buildPuzzle({ kind: "free", size: 4, tier: 0, n: 1 }).givens, buildPuzzle({ kind: "free", size: 4, tier: 0, n: 2 }).givens);
});

test("hints: wrong first, then a real step, null when solved", () => {
  for (const level of [1, 12, 22, 31, 40, 48, 53, 58]) {
    const pz = trailPuzzle(level);
    const h = nextHint(pz, pz.givens.slice());
    assert.equal(h.kind, "step");
    for (const p of h.placements) assert.equal(p.digit, pz.solution[p.cell]);
    for (const e of h.eliminations) assert.notEqual(e.digit, pz.solution[e.cell]);
    if (!h.placements.length) assert.equal(h.then.digit, pz.solution[h.then.cell]);
    assert.ok(h.unit && Array.isArray(h.unit.cells) && h.text && h.text.key);
    // A wrong entry is reported before any logic.
    const entries = pz.givens.slice();
    const hole = entries.indexOf(0);
    entries[hole] = (pz.solution[hole] % pz.size) + 1;
    assert.deepEqual(nextHint(pz, entries), { kind: "wrong", cells: [hole] });
    assert.equal(nextHint(pz, pz.solution.slice()), null);
  }
});

test("hints: following hints alone solves a hard 9×9", () => {
  for (const level of [55, 58, 60]) {
    const pz = trailPuzzle(level);
    const entries = pz.givens.slice();
    for (let guard = 0; guard < 81; guard++) {
      const h = nextHint(pz, entries);
      if (!h) break;
      assert.equal(h.kind, "step");
      const p = h.placements[0] || h.then;
      assert.ok(p, `level ${level}: a hint with nothing to place`);
      assert.equal(p.digit, pz.solution[p.cell]);
      entries[p.cell] = p.digit;
    }
    assert.deepEqual(entries, pz.solution);
  }
});

test("tutorial: valid, unique, and each opens with its own rule", () => {
  assert.equal(TUTORIAL.length, 3);
  const g = geometry(4);
  const type = { rows: "row", cols: "col", boxes: "box" };
  for (const t of TUTORIAL) {
    assert.equal(t.size, 4);
    assert.ok(validSolution(t.solution, g), t.rule);
    t.givens.forEach((d, i) => assert.ok(d === 0 || d === t.solution[i]));
    assert.equal(countSolutions(t.givens, g, 2), 1);
    assert.ok(logicSolve(t.givens, g, 0).solved);
    // The units that can finish themselves at the start are exactly the
    // ones of this board's rule, and there is at least one.
    const open = g.units.filter((u) => u.cells.filter((i) => !t.givens[i]).length === 1);
    assert.ok(open.length > 0);
    assert.ok(open.every((u) => u.type === type[t.rule]), `${t.rule}: ${open.map((u) => u.type)}`);
    assert.ok(typeof t.coach === "string" && t.coach.length < 90);
  }
});

test("engine: getPuzzle resolves (main-thread fallback in Node) and rejects nonsense", async () => {
  const a = await getPuzzle({ kind: "trail", level: 36 });
  assert.deepEqual(a, trailPuzzle(36));
  const b = await getPuzzle({ kind: "trail", level: 36 });
  assert.notEqual(a.givens, b.givens, "callers get their own arrays");
  assert.deepEqual(a, b);
  await assert.rejects(getPuzzle({ kind: "trail", level: 61 }));
  await assert.rejects(getPuzzle({ kind: "free", size: 4, tier: 3, n: 0 }));
  await assert.rejects(getPuzzle({ kind: "free", size: 5, tier: 0, n: 0 }));
  assert.equal(BANDS.reduce((n, b) => n + b.levels[1] - b.levels[0] + 1, 0), LEVEL_COUNT);
});
