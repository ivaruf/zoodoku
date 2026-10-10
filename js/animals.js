/*
 * animals.js — the nine pieces on the board, and the numerals that replace
 * them once a player is promoted to numbers.
 *
 * The engine only knows digits 1..9. Everything a player actually *sees* in a
 * cell comes from here: symbolMarkup(d, skin) hands back an inline <svg>
 * string, symbolName(d, skin) hands back the word a screen reader or a hint
 * should use ("fox", "foxes", "7" — or "rev", in Norwegian). Skin is pure rendering and lives nowhere
 * else (DESIGN.md §2, §5).
 *
 * HOW THE ANIMALS ARE DRAWN. Hand-authored SVG on a 100×100 viewBox with a
 * transparent ground, so the board's own tile shows through. One family:
 * flat sticker shapes, one body colour, one darker shade of it, one cream or
 * white accent, an outline in a deep tint of the animal's own colour, and the
 * same dot eye (ink #2e4a48 with a white highlight) on every face.
 *
 * WHY THE SILHOUETTES MATTER MORE THAN THE COLOURS. Roughly one boy in
 * twelve is colour-blind, and this is a game for boys and girls of 7–12, so
 * the nine must be told apart by outline alone — at 28 px on a phone's 9×9
 * board, where all detail has gone. Each has one feature that owns its
 * outline: the fox's two tall ears and pointed chin, the frog's eye bumps on
 * a wide low body, the whale's side-on body with an upturned tail and spout,
 * the lion's scalloped mane ring, the pig's floppy ears and big snout, the
 * owl's tufts and two huge eyes, the bear's round ears, the penguin's whole
 * standing figure with flippers and feet, and the crab's two raised claws on
 * a flat body. If you change one, check the contact sheet at 28 px.
 *
 * ANIMATION HOOKS. The root is <svg class="zd-sym zd-a-<id>">. Ears, tufts,
 * mane, spout, flippers and claws sit in <g class="zd-ears">, drawn behind
 * the head, so CSS can wiggle them; the eyes sit in <g class="zd-eyes"> with
 * a transform-origin on the eye line, so `transform: scaleY(.1)` is a blink
 * rather than the eyes sliding to the top of the tile. Both groups use
 * transform-box: view-box coordinates (the SVG default), which is why the
 * origins are given in viewBox pixels.
 *
 * NUMERALS. The numbers skin draws 1–9 as stroked centre-line paths with
 * round caps and joins — never text, because a font is different on every
 * platform and would sit differently in every cell. One stroke weight for all
 * nine, ink-coloured, centred on the viewBox.
 *
 * Every string is built once at module load and cached; symbolMarkup is an
 * array lookup per call.
 */

import { t } from './i18n.js';

const INK = '#2e4a48';

// ---- the nine ----------------------------------------------------------
// Order is the digit order: 1 = fox … 9 = crab (DESIGN.md §2 table).
export const ANIMALS = [
  { d: 1, id: 'fox', name: 'fox', plural: 'foxes', color: '#f28c38' },
  { d: 2, id: 'frog', name: 'frog', plural: 'frogs', color: '#5cbf60' },
  { d: 3, id: 'whale', name: 'whale', plural: 'whales', color: '#4a90d9' },
  { d: 4, id: 'lion', name: 'lion', plural: 'lions', color: '#f2c230' },
  { d: 5, id: 'pig', name: 'pig', plural: 'pigs', color: '#f29bb5' },
  { d: 6, id: 'owl', name: 'owl', plural: 'owls', color: '#9b6fd1' },
  { d: 7, id: 'bear', name: 'bear', plural: 'bears', color: '#9a6a44' },
  { d: 8, id: 'penguin', name: 'penguin', plural: 'penguins', color: '#2b2f3a' },
  { d: 9, id: 'crab', name: 'crab', plural: 'crabs', color: '#e0503c' },
];

// ---- tiny builders ------------------------------------------------------
// Outline width in viewBox units. 4.5 of 100 is ~1.3 px at 28 px — the
// thinnest that still survives as a line rather than a smudge.
const OW = 4.5;

// A filled, outlined path. `o` is the outline colour; pass null for none.
function P(d, fill, o) {
  return o
    ? `<path d="${d}" fill="${fill}" stroke="${o}" stroke-width="${OW}" stroke-linejoin="round"/>`
    : `<path d="${d}" fill="${fill}"/>`;
}
function C(x, y, r, fill, o) {
  return o
    ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${o}" stroke-width="${OW}"/>`
    : `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
}
function E(x, y, rx, ry, fill, o) {
  return o
    ? `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${o}" stroke-width="${OW}"/>`
    : `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
}
// An open stroke (mouths, legs, stalks).
function L(d, color, w) {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
// The house eye: ink dot, white glint up and to the right.
function eye(x, y, r = 5.5) {
  const g = (r * 0.36).toFixed(1);
  const k = (r * 0.34).toFixed(1);
  return C(x, y, r, INK) + C((x + +k).toFixed(1), (y - +k).toFixed(1), g, '#fff');
}
function eyes(y, inner) {
  return `<g class="zd-eyes" style="transform-origin:50px ${y}px">${inner}</g>`;
}
function ears(inner) {
  return `<g class="zd-ears">${inner}</g>`;
}
function svg(cls, inner) {
  return `<svg class="zd-sym ${cls}" viewBox="0 0 100 100" aria-hidden="true">${inner}</svg>`;
}

// ---- the drawings -------------------------------------------------------
// Each returns the inner markup. Palette per animal: body (the table colour),
// sh (shade), o (outline), and an accent.

function fox() {
  const body = '#f28c38', sh = '#d4691f', o = '#8a3f10', cream = '#fff3e2';
  return (
    ears(
      P('M16 48 L20 8 L46 30 Z', body, o) +
        P('M84 48 L80 8 L54 30 Z', body, o) +
        P('M23 38 L25 19 L37 30 Z', sh) +
        P('M77 38 L75 19 L63 30 Z', sh)
    ) +
    P('M10 44 C10 30 28 25 50 25 C72 25 90 30 90 44 C90 58 72 72 50 90 C28 72 10 58 10 44 Z', body, o) +
    // The white cheeks: one cream mask over the lower face, so the chin
    // reads as a point even when the outline is a single pixel.
    P('M12 50 C26 50 40 57 50 64 C60 57 74 50 88 50 C84 62 68 75 50 88 C32 75 16 62 12 50 Z', cream) +
    P('M44 80 C44 76 56 76 56 80 C56 84 52 86 50 86 C48 86 44 84 44 80 Z', '#3a2418') +
    eyes(46, eye(35, 45) + eye(65, 45))
  );
}

function frog() {
  const body = '#5cbf60', sh = '#3e9a46', o = '#24602c', cream = '#f2fbe6';
  return (
    // The eye bumps own the frog's outline, so they are the animatable bit.
    ears(C(29, 34, 16, body, o) + C(71, 34, 16, body, o)) +
    P('M6 64 C6 46 26 40 50 40 C74 40 94 46 94 64 C94 82 74 88 50 88 C26 88 6 82 6 64 Z', body, o) +
    // Re-fill the bumps without an outline, so the body's top edge does not
    // cut across them: one silhouette, not three stacked shapes.
    C(29, 34, 15.2, body) +
    C(71, 34, 15.2, body) +
    E(50, 76, 24, 9, sh) +
    L('M28 64 C38 72 62 72 72 64', o, 4) +
    C(45, 54, 1.8, o) +
    C(55, 54, 1.8, o) +
    eyes(33, C(29, 33, 10, cream) + C(71, 33, 10, cream) + eye(30, 34, 6) + eye(70, 34, 6))
  );
}

function whale() {
  const body = '#4a90d9', sh = '#3672b8', o = '#1f4a80', cream = '#eaf3fc', spray = '#a8d6fb';
  return (
    // The spout is the whale's "ears": the thing that can bob.
    ears(
      L('M34 28 C33 20 28 15 20 14 M37 27 L37 9 M40 28 C41 20 46 15 54 14', o, 9) +
        L('M34 28 C33 20 28 15 20 14 M37 27 L37 9 M40 28 C41 20 46 15 54 14', spray, 4.5)
    ) +
    // Side-on, head left, the tail flung up and over at the right: the one
    // piece in the set that is not a face, which is exactly why it cannot be
    // mistaken for one.
    P(
      'M6 60 C6 42 20 32 38 32 C56 32 68 42 74 54 C77 46 78 38 76 30 C82 28 92 26 96 20 C97 30 92 38 84 40 C90 42 94 46 96 52 C88 54 82 52 78 50 C78 72 62 84 40 84 C20 84 6 76 6 60 Z',
      body,
      o
    ) +
    // Pale belly with three throat grooves.
    P('M8 64 C20 70 44 72 66 66 C60 78 50 84 40 84 C22 84 10 76 8 64 Z', cream) +
    L('M22 72 L50 72 M28 78 L48 78', '#c3d9f0', 2.5) +
    P('M44 62 C50 58 56 58 60 62 C56 64 50 64 44 62 Z', sh) +
    L('M18 58 C22 61 27 61 30 58', o, 3.5) +
    eyes(48, eye(26, 48, 5.5))
  );
}

// The lion's mane: fourteen bumps on a ring, generated once rather than
// typed out, so the scallops are even.
function maneRing(cx, cy, R, bumps, depth) {
  let d = '';
  for (let i = 0; i <= bumps; i++) {
    const a0 = ((i - 0.5) / bumps) * Math.PI * 2 - Math.PI / 2;
    const a1 = (i / bumps) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((i + 0.5) / bumps) * Math.PI * 2 - Math.PI / 2;
    const p0 = [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R];
    const pk = [cx + Math.cos(a1) * (R + depth * 2), cy + Math.sin(a1) * (R + depth * 2)];
    const p2 = [cx + Math.cos(a2) * R, cy + Math.sin(a2) * R];
    if (i === 0) d += `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}`;
    if (i < bumps) d += `Q${pk[0].toFixed(1)} ${pk[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

function lion() {
  const body = '#f2c230', mane = '#d9822b', maneSh = '#b8641a', o = '#7a4a10', cream = '#fff4d6';
  return (
    ears(
      P(maneRing(50, 52, 34, 13, 5.5), mane, o) + P(maneRing(50, 52, 27, 13, 3), maneSh)
    ) +
    C(29, 32, 7, body, o) +
    C(71, 32, 7, body, o) +
    C(50, 54, 26, body, o) +
    E(42, 66, 9.5, 8, cream) +
    E(58, 66, 9.5, 8, cream) +
    P('M44 58 L56 58 L50 65 Z', '#5a3418', null) +
    L('M50 65 L50 70', '#5a3418', 2.5) +
    eyes(49, eye(40, 48, 5) + eye(60, 48, 5))
  );
}

function pig() {
  const body = '#f29bb5', sh = '#dc6f94', o = '#9a3d60';
  return (
    // Floppy: each ear rises off the crown, folds over and hangs down past
    // the side of the head, tip outward. Pointing up they read as a cat's
    // (or the owl's tufts at 28 px); hanging, nothing else in the set has
    // them, and they widen the pig into the set's only "lopped" outline.
    ears(
      P('M42 30 C34 16 18 12 10 18 C5 28 3 40 4 52 C12 48 20 42 26 38 Z', body, o) +
        P('M58 30 C66 16 82 12 90 18 C95 28 97 40 96 52 C88 48 80 42 74 38 Z', body, o) +
        P('M11 21 C8 30 7 40 7 47 C13 43 18 39 21 36 C19 30 15 25 11 21 Z', sh) +
        P('M89 21 C92 30 93 40 93 47 C87 43 82 39 79 36 C81 30 85 25 89 21 Z', sh)
    ) +
    E(50, 58, 35, 31, body, o) +
    E(50, 67, 17, 12, sh, o) +
    E(44, 67, 3.2, 4.6, '#7a2e4a') +
    E(56, 67, 3.2, 4.6, '#7a2e4a') +
    C(25, 60, 5, '#f7b9cb') +
    C(75, 60, 5, '#f7b9cb') +
    eyes(48, eye(36, 48) + eye(64, 48))
  );
}

function owl() {
  const body = '#9b6fd1', sh = '#7b52b4', o = '#4a2a7a', cream = '#f6efff', beak = '#f2a33a';
  return (
    ears(P('M18 34 L16 6 L40 22 Z', body, o) + P('M82 34 L84 6 L60 22 Z', body, o)) +
    P('M14 46 C14 26 30 18 50 18 C70 18 86 26 86 46 L86 64 C86 82 70 92 50 92 C30 92 14 82 14 64 Z', body, o) +
    // Wings as shade crescents down each side.
    P('M14 52 C24 60 26 76 22 86 C16 80 14 72 14 64 Z', sh) +
    P('M86 52 C76 60 74 76 78 86 C84 80 86 72 86 64 Z', sh) +
    // Belly with three feather chevrons.
    P('M32 68 C32 60 40 58 50 58 C60 58 68 60 68 68 C68 80 60 88 50 88 C40 88 32 80 32 68 Z', cream) +
    L('M42 70 L46 73 L50 70 L54 73 L58 70 M44 79 L47 82 L50 79 L53 82 L56 79', '#c9b3e6', 2.5) +
    // The two great eye discs ARE the owl at 28 px.
    C(34, 42, 15, cream, o) +
    C(66, 42, 15, cream, o) +
    P('M44 52 L56 52 L50 62 Z', beak, '#a35f12') +
    eyes(42, eye(35, 43, 8) + eye(65, 43, 8))
  );
}

function bear() {
  const body = '#9a6a44', sh = '#7a4f2e', o = '#4a2c16', cream = '#ead2b2';
  return (
    ears(C(23, 26, 14, body, o) + C(77, 26, 14, body, o) + C(23, 26, 7, sh) + C(77, 26, 7, sh)) +
    E(50, 56, 37, 34, body, o) +
    E(50, 68, 17, 13, cream) +
    P('M43 61 C43 57 57 57 57 61 C57 65 52 68 50 68 C48 68 43 65 43 61 Z', '#2e1a0c') +
    L('M50 68 L50 73 M44 75 C47 77 53 77 56 75', '#2e1a0c', 2.8) +
    eyes(48, eye(36, 48) + eye(64, 48))
  );
}

function penguin() {
  const body = '#2b2f3a', o = '#11131a', white = '#fbfaf5', beak = '#f59a2e', beakO = '#a3560f';
  return (
    // Flippers out from the sides: they can flap.
    ears(
      P('M22 48 C12 54 8 64 10 74 C16 70 22 64 26 60 Z', body, o) +
        P('M78 48 C88 54 92 64 90 74 C84 70 78 64 74 60 Z', body, o)
    ) +
    // Feet first, so the body stands on them.
    E(38, 90, 10, 5, beak, beakO) +
    E(62, 90, 10, 5, beak, beakO) +
    // The whole standing figure: an egg, black hood on top.
    P('M50 8 C70 8 80 26 80 48 C80 72 70 88 50 88 C30 88 20 72 20 48 C20 26 30 8 50 8 Z', body, o) +
    // White face (two lobes meeting at a widow's peak) running down into the
    // belly — the one white shape in the set that is a hood cut-out.
    P('M50 28 C56 20 70 22 70 36 C70 44 66 48 66 52 C72 60 72 70 68 78 C62 85 38 85 32 78 C28 70 28 60 34 52 C34 48 30 44 30 36 C30 22 44 20 50 28 Z', white) +
    P('M43 44 L57 44 L50 54 Z', beak, beakO) +
    eyes(37, eye(40, 37, 5) + eye(60, 37, 5))
  );
}

function crab() {
  const body = '#e0503c', sh = '#bd3828', o = '#7a1e12', white = '#fff7ef';
  // A pincer: a round claw with a wedge bitten out of the top, so the pair
  // reads as claws-up even at 28 px. x is the claw centre; dir mirrors it.
  const claw = (x, dir) =>
    P(
      `M${x - 13 * dir} 26 C${x - 15 * dir} 36 ${x - 8 * dir} 42 ${x} 42 C${x + 9 * dir} 42 ${x + 14 * dir} 34 ${x + 13 * dir} 24 L${x + 4 * dir} 28 L${x + 2 * dir} 12 C${x - 6 * dir} 12 ${x - 12 * dir} 18 ${x - 13 * dir} 26 Z`,
      body,
      o
    );
  return (
    // Legs, then the arms and claws, all behind the shell.
    L('M22 70 L8 74 M22 78 L10 86 M78 70 L92 74 M78 78 L90 86', o, 9) +
    L('M22 70 L8 74 M22 78 L10 86 M78 70 L92 74 M78 78 L90 86', body, 4.5) +
    ears(
      L('M28 62 L20 40 M72 62 L80 40', o, 10) +
        L('M28 62 L20 40 M72 62 L80 40', body, 5.5) +
        claw(19, 1) +
        claw(81, -1)
    ) +
    // Eye stalks.
    L('M42 56 L40 38 M58 56 L60 38', o, 8) +
    L('M42 56 L40 38 M58 56 L60 38', body, 3.5) +
    E(50, 70, 32, 18, body, o) +
    P('M24 74 C34 82 66 82 76 74 C70 84 60 88 50 88 C40 88 30 84 24 74 Z', sh) +
    L('M42 72 C46 75 54 75 58 72', o, 3.5) +
    eyes(36, C(40, 36, 7, white, o) + C(60, 36, 7, white, o) + eye(40.5, 36.5, 3.6) + eye(59.5, 36.5, 3.6))
  );
}

const DRAW = [fox, frog, whale, lion, pig, owl, bear, penguin, crab];

// ---- numerals -----------------------------------------------------------
// Centre-line paths in a 38-wide, 64-tall box centred on (50, 50). Stroke
// 11 with round ends: chunky without the counters of 6, 8 and 9 closing up
// at 28 px. The 9 is the 6 turned half a turn, so the pair cannot disagree.
const SIX =
  'M64 22 C60 19 55 18 50 18 C38 18 31 31 31 51 C31 71 39 82 50 82 C61 82 69 74 69 63 C69 52 61 45 51 45 C42 45 35 50 31 57';
const DIGITS = [
  'M37 30 L52 19 L52 81 M38 81 L66 81',
  'M32 33 C32 23 40 18 50 18 C60 18 68 24 68 34 C68 46 56 56 32 81 L69 81',
  'M33 25 C37 20 43 18 50 18 C60 18 67 24 67 33 C67 42 59 48 48 48 C61 48 69 55 69 65 C69 75 61 82 50 82 C42 82 35 79 31 73',
  'M58 81 L58 19 L29 63 L71 63',
  'M66 19 L38 19 L35 47 C40 44 45 43 51 43 C62 43 69 51 69 62 C69 74 60 82 49 82 C41 82 35 79 31 74',
  SIX,
  'M31 19 L69 19 L45 81',
  'M50 47 C41 47 35 42 35 33 C35 24 41 18 50 18 C59 18 65 24 65 33 C65 42 59 47 50 47 C40 47 32 54 32 64 C32 75 40 82 50 82 C60 82 68 75 68 64 C68 54 60 47 50 47 Z',
  SIX, // turned below
];

function numeral(d) {
  const t = d === 9 ? ' transform="rotate(180 50 50)"' : '';
  return svg(
    'zd-n',
    `<path d="${DIGITS[d - 1]}"${t} fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

// ---- cache --------------------------------------------------------------
const ANIMAL_SVG = ANIMALS.map((a, i) => svg(`zd-a-${a.id}`, DRAW[i]()));
const NUMBER_SVG = ANIMALS.map((a) => numeral(a.d));

/** Inline <svg> markup for digit d (1..9) in skin 'animals' | 'numbers'.
 *  Returns '' for anything out of range (an empty cell is digit 0). */
export function symbolMarkup(d, skin) {
  if (!(d >= 1 && d <= 9)) return '';
  return skin === 'numbers' ? NUMBER_SVG[d - 1] : ANIMAL_SVG[d - 1];
}

/*
 * The words for digit d, in the current language (js/i18n.js holds them; the
 * `name` and `plural` fields above stay English, as ids for the art).
 *   symbolName(d, skin)    'fox' / 'rev', or '7'          (plural: 'foxes' / 'rever')
 *   symbolThe(d, skin)     'the fox' / 'reven', 'the 7' / '7-eren'
 *   symbolA(d, skin)       'a fox' / 'en rev', 'a 7' / 'en 7-er'
 * Norwegian folds the article into the noun, which is why a hint asks for
 * the whole phrase rather than gluing "the " onto a name.
 */
const idOf = (d, skin) => (skin === 'numbers' ? null : ANIMALS[d - 1].id);

export function symbolName(d, skin, { plural = false } = {}) {
  if (!(d >= 1 && d <= 9)) return '';
  return t(plural ? 'symMany' : 'symName', idOf(d, skin), d);
}
export function symbolThe(d, skin) {
  if (!(d >= 1 && d <= 9)) return '';
  return t('symThe', idOf(d, skin), d);
}
export function symbolA(d, skin) {
  if (!(d >= 1 && d <= 9)) return '';
  return t('symA', idOf(d, skin), d);
}
