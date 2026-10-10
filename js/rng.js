/*
 * rng.js — the only source of chance in the engine.
 *
 * WHY A SEEDED GENERATOR AND NOT Math.random
 *   Level 23 has to be the same level 23 on every phone, tablet and laptop,
 *   whether it was built in a Worker or on the main thread, today or after a
 *   deploy that did not touch the generator. That only holds if every random
 *   decision the engine makes comes from a generator seeded by the puzzle's
 *   seed string. Nothing under js/ that belongs to the engine may call
 *   Math.random() or read the clock — one stray call and two devices diverge
 *   silently.
 *
 * THE PIECES
 *   cyrb128 turns a string into four 32-bit words (a small, well-mixed public
 *   domain hash); sfc32 is a fast 128-bit-state generator fed by those words.
 *   Both use only 32-bit integer ops (Math.imul, shifts, |0), which every JS
 *   engine evaluates identically, and next() divides a uint32 by 2^32, which
 *   is exact in a double. int(n) multiplies that by a small n — also exact —
 *   and floors it, so there is no platform rounding anywhere in the chain.
 */

/* String → four uint32 words. */
export function cyrb128(str) {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/*
 * makeRng(seed) → { next, int, shuffle, pick }
 *   next()      float in [0, 1)
 *   int(n)      integer in [0, n)
 *   shuffle(a)  Fisher–Yates in place, returns a
 *   pick(a)     one element of a
 */
export function makeRng(seed) {
  let [a, b, c, d] = cyrb128(String(seed));
  function next() {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  // The first few outputs of sfc32 still carry the shape of the seed words;
  // throwing a dozen away is the customary warm-up.
  for (let i = 0; i < 12; i++) next();
  const int = (n) => Math.floor(next() * n);
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
  const pick = (arr) => arr[int(arr.length)];
  return { next, int, shuffle, pick };
}
