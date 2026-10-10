/*
 * grid.js — the shape of a board, and nothing else.
 *
 * Three sizes exist: 4×4 with 2×2 boxes, 6×6 with boxes 2 rows tall and 3
 * columns wide (the shape every printed 6×6 uses, and the one the coach line
 * "boxes are 2 tall, 3 wide" promises), and 9×9 with 3×3 boxes. A box is
 * always bh rows × bw columns. Cells are numbered r*N + c; digits are 1..N
 * and 0 is empty — the whole engine and the UI agree on that (DESIGN §5).
 *
 * Everything here is computed once per size, memoised, and frozen, because
 * the solver, the techniques and the UI all ask for the same tables thousands
 * of times and must never be able to scribble on each other's copy.
 *
 * Units are ordered rows, then columns, then boxes, each by index. Several
 * callers rely on that order being stable (it decides which of two equally
 * cheap hints is offered first, so it is part of determinism), so do not
 * reorder it casually.
 *
 * Candidate masks everywhere use bit (d-1) for digit d. POP and LOWBIT are
 * lookup tables over every 9-bit mask so popcounts never loop.
 */

const SHAPES = { 4: [2, 2], 6: [2, 3], 9: [3, 3] };
const cache = new Map();

/* popcount and index-of-lowest-bit for every mask up to 9 bits. */
export const POP = new Uint8Array(512);
export const LOWBIT = new Int8Array(512);
for (let m = 1; m < 512; m++) {
  POP[m] = POP[m >> 1] + (m & 1);
  LOWBIT[m] = m & 1 ? 0 : LOWBIT[m >> 1] + 1;
}
LOWBIT[0] = -1;

/* Bits of a mask as digits 1..N, ascending. Allocates; not for hot loops. */
export function maskDigits(m) {
  const out = [];
  for (let d = 1; m; d++, m >>= 1) if (m & 1) out.push(d);
  return out;
}

export function geometry(size) {
  const hit = cache.get(size);
  if (hit) return hit;
  const shape = SHAPES[size];
  if (!shape) throw new Error(`zoodoku: no board of size ${size}`);
  const [bh, bw] = shape;
  const N = size;
  const cells = N * N;
  const rowOf = [];
  const colOf = [];
  const boxOf = [];
  for (let i = 0; i < cells; i++) {
    const r = Math.floor(i / N);
    const c = i % N;
    rowOf.push(r);
    colOf.push(c);
    // Boxes are numbered left to right, top to bottom: N/bw boxes per band.
    boxOf.push(Math.floor(r / bh) * (N / bw) + Math.floor(c / bw));
  }
  const units = [];
  for (const type of ["row", "col", "box"]) {
    for (let index = 0; index < N; index++) {
      const list = [];
      for (let i = 0; i < cells; i++) {
        const k = type === "row" ? rowOf[i] : type === "col" ? colOf[i] : boxOf[i];
        if (k === index) list.push(i);
      }
      // uid is the unit's position in `units`, so per-unit counters can live
      // in a flat typed array (techniques.js keeps one of empty cells).
      units.push(Object.freeze({ type, index, uid: units.length, cells: Object.freeze(list) }));
    }
  }
  const rows = Object.freeze(units.slice(0, N));
  const cols = Object.freeze(units.slice(N, 2 * N));
  const boxes = Object.freeze(units.slice(2 * N));
  // cellUnits[i] = [its row, its column, its box] as unit objects.
  const cellUnits = [];
  for (let i = 0; i < cells; i++) {
    cellUnits.push(Object.freeze([rows[rowOf[i]], cols[colOf[i]], boxes[boxOf[i]]]));
  }
  // Peer matrix as a typed array behind a function: a typed array with
  // elements cannot be frozen (Object.freeze throws on it), and isPeer() is
  // all anyone needs from it.
  const peerBits = new Uint8Array(cells * cells);
  const peers = [];
  for (let i = 0; i < cells; i++) {
    const list = [];
    for (let j = 0; j < cells; j++) {
      if (i !== j && (rowOf[i] === rowOf[j] || colOf[i] === colOf[j] || boxOf[i] === boxOf[j])) {
        list.push(j);
        peerBits[i * cells + j] = 1;
      }
    }
    peers.push(Object.freeze(list));
  }
  const geo = Object.freeze({
    N,
    bh,
    bw,
    cells,
    all: (1 << N) - 1,
    rowOf: Object.freeze(rowOf),
    colOf: Object.freeze(colOf),
    boxOf: Object.freeze(boxOf),
    units: Object.freeze(units),
    rows,
    cols,
    boxes,
    cellUnits: Object.freeze(cellUnits),
    peers: Object.freeze(peers),
    isPeer: (a, b) => peerBits[a * cells + b] === 1,
  });
  cache.set(size, geo);
  return geo;
}
