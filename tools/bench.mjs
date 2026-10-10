/*
 * bench.mjs — how long each band takes to generate, and whether it hit.
 *
 *   node tools/bench.mjs          the trail once + 5 free-roam boards per paw
 *   node tools/bench.mjs 20       ... 20 free-roam boards per paw instead
 *
 * Times are single-threaded Node on this machine; a phone is perhaps 3–5×
 * slower, and the 9×9 and required-tier bands run in a Worker there, so a
 * slow band costs a spinner, never a frozen page. The budget in levels.js
 * is attempts, not time, so these numbers are what to look at when tuning
 * it: "hit" is how many boards met their band's targets, "tier" the graded
 * tiers that actually came out.
 */

import { BANDS, LEVEL_COUNT, FREE_TIERS } from "../js/levels.js";
import { buildPuzzle } from "../js/engine.js";

const perPaw = Number(process.argv[2] || 5);

function row(cells) {
  return cells.map((c, i) => String(c).padEnd([7, 8, 9, 9, 6, 10, 18][i] || 12)).join("");
}

function summarise(label, runs) {
  const ms = runs.map((r) => r.ms);
  const total = ms.reduce((a, b) => a + b, 0);
  const tiers = {};
  for (const r of runs) tiers[r.tier] = (tiers[r.tier] || 0) + 1;
  const clues = runs.map((r) => r.clues);
  return row([
    label,
    String(runs.length),
    (total / runs.length).toFixed(1),
    Math.max(...ms).toFixed(1),
    `${runs.filter((r) => r.hit).length}/${runs.length}`,
    `${Math.min(...clues)}-${Math.max(...clues)}`,
    Object.entries(tiers)
      .map(([t, n]) => `T${t}×${n}`)
      .join(" "),
  ]);
}

function time(spec) {
  const t0 = performance.now();
  const pz = buildPuzzle(spec);
  return { ms: performance.now() - t0, tier: pz.tier, hit: pz.hit, clues: pz.clues };
}

console.log("TRAIL (each level once)");
console.log(row(["band", "levels", "avg ms", "max ms", "hit", "clues", "graded tiers"]));
let trailTotal = 0;
for (const band of BANDS) {
  const runs = [];
  for (let l = band.levels[0]; l <= band.levels[1]; l++) runs.push(time({ kind: "trail", level: l }));
  trailTotal += runs.reduce((a, r) => a + r.ms, 0);
  console.log(summarise(band.id, runs));
}
console.log(`all ${LEVEL_COUNT} levels: ${trailTotal.toFixed(0)} ms\n`);

console.log(`FREE ROAM (${perPaw} boards per paw)`);
console.log(row(["band", "boards", "avg ms", "max ms", "hit", "clues", "graded tiers"]));
for (const size of [4, 6, 9]) {
  for (let tier = 0; tier < FREE_TIERS[size]; tier++) {
    const runs = [];
    for (let n = 1; n <= perPaw; n++) runs.push(time({ kind: "free", size, tier, n }));
    console.log(summarise(`${size}-t${tier}`, runs));
  }
}
