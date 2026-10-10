/*
 * board.js — draws the board, and only draws it.
 *
 * It owns the grid's DOM and every class on it; it holds no game state of
 * its own beyond "what is currently shown", which it keeps so that a move
 * repaints the two or three cells it touched rather than all eighty-one.
 * play.js decides *what* to show; input.js asks it *where* a point falls.
 *
 * STRUCTURE. A `role="grid"` of `role="row"`s of real `<button>`s, each
 * `role="gridcell"` with an aria-label that reads as a sentence ("Row 2,
 * column 3: fox", "…: empty", "…: fox, given"), so the board is a keyboard
 * and screen-reader object and not a picture. One roving tabindex: the
 * selected cell is the board's single tab stop and the arrows move within.
 *
 * Inside a cell:
 *   .zd-tile    the piece. Givens are flat `--given` tiles printed on the
 *               board; entries are raised chunky tiles with a soft bottom
 *               shadow, like something you could pick up — because you can.
 *   .zd-notes   a tiny grid with one fixed slot per digit, built lazily the
 *               first time that cell gets a mark (most cells never do), so a
 *               fox note always sits in the fox's corner.
 *
 * BOX LINES. The cells sit on a grid with a uniform gap and half a gap of
 * padding around it, which makes every track exactly (cell + gap) wide; a
 * separate overlay of one div per box then lands its borders precisely on
 * the gap centres. That keeps the thick ink lines independent of the cells
 * (no per-cell edge classes to keep right for 2×2, 2×3 and 3×3 boxes) and
 * keeps every cell the same size — a cell with a thicker border on one side
 * would be a smaller cell.
 *
 * HIGHLIGHTING EVERY COPY OF A SYMBOL costs no loop at all: each cell carries
 * `data-d` for the digit it shows, the board carries `data-hl` for the digit
 * in focus, and nine CSS rules in board.css match the two up. The same trick
 * lights the matching pencil mark in every notes grid.
 *
 * ANIMATION is CSS throughout. A class is added, `animationend` (one
 * delegated listener) takes it off again; the only JS per frame is none.
 * Restarting an animation that is already running needs the class removed,
 * a reflow, and the class re-added — that is what `restart()` does, and it is
 * only ever called on a player action, never in a loop.
 */

import { symbolMarkup, symbolName } from './animals.js';

/** Classes that only ever live for one CSS animation. */
const TRANSIENT = ['hop', 'wiggle', 'pop'];

export function createBoard(geo, { skin = 'animals', emphasis = null } = {}) {
  const N = geo.N;
  const bh = geo.bh;
  const bw = geo.bw;
  const total = N * N;
  let curSkin = skin;

  // ---- build ----------------------------------------------------------------

  const el = document.createElement('div');
  el.className = 'zd-board';
  el.setAttribute('role', 'grid');
  el.setAttribute('aria-label', `Puzzle board, ${N} by ${N}`);
  el.style.setProperty('--n', N);
  el.dataset.size = N;

  const grid = document.createElement('div');
  grid.className = 'zd-grid';
  el.appendChild(grid);

  const cells = new Array(total);
  const tiles = new Array(total);
  const noteEls = new Array(total).fill(null);
  for (let r = 0; r < N; r++) {
    const row = document.createElement('div');
    row.className = 'zd-row';
    row.setAttribute('role', 'row');
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'zd-cell';
      b.setAttribute('role', 'gridcell');
      b.tabIndex = -1;
      b.dataset.i = i;
      b.dataset.d = 0;
      const t = document.createElement('span');
      t.className = 'zd-tile';
      t.setAttribute('aria-hidden', 'true');
      b.appendChild(t);
      row.appendChild(b);
      cells[i] = b;
      tiles[i] = t;
    }
    grid.appendChild(row);
  }
  cells[0].tabIndex = 0;

  const boxes = document.createElement('div');
  boxes.className = 'zd-boxes';
  boxes.setAttribute('aria-hidden', 'true');
  boxes.style.setProperty('--bx', N / bw);
  boxes.style.setProperty('--by', N / bh);
  for (let k = 0; k < N; k++) boxes.appendChild(document.createElement('div'));
  el.appendChild(boxes);

  const rowOf = (i) => (i / N) | 0;
  const colOf = (i) => i % N;
  const boxOf = (i) => ((rowOf(i) / bh) | 0) * (N / bw) + ((colOf(i) / bw) | 0);

  // Tutorial emphasis: every other row / column / box gets a faint tint, so
  // the rule being taught ("each row has one of each") is a set of visible
  // strips rather than an abstraction.
  if (emphasis) {
    el.classList.add('has-emph');
    for (let i = 0; i < total; i++) {
      let on = false;
      if (emphasis === 'rows') on = rowOf(i) % 2 === 0;
      else if (emphasis === 'cols') on = colOf(i) % 2 === 0;
      else if (emphasis === 'boxes') on = (((rowOf(i) / bh) | 0) + ((colOf(i) / bw) | 0)) % 2 === 0;
      if (on) cells[i].classList.add('emph');
    }
  }

  // ---- what is shown ---------------------------------------------------------

  const shownD = new Int8Array(total).fill(-1); // -1 forces the first paint
  const shownNotes = new Uint16Array(total);
  const shownLabel = new Array(total).fill('');
  let markupCache = buildMarkup(curSkin);

  function buildMarkup(s) {
    const m = [''];
    for (let d = 1; d <= N; d++) m.push(symbolMarkup(d, s));
    return m;
  }

  /** Paint cell i. Only touches the DOM where something actually changed. */
  function renderCell(i, d, given, notes, clash) {
    const b = cells[i];
    if (shownD[i] !== d) {
      tiles[i].innerHTML = markupCache[d] || '';
      b.dataset.d = d;
      b.classList.toggle('has-tile', d > 0);
      shownD[i] = d;
    }
    b.classList.toggle('is-given', !!given);
    b.classList.toggle('is-entry', d > 0 && !given);
    const showNotes = d === 0 ? notes : 0;
    if (showNotes !== shownNotes[i]) {
      if (showNotes && !noteEls[i]) noteEls[i] = buildNotes(i);
      if (noteEls[i]) {
        const slots = noteEls[i].children;
        for (let k = 0; k < N; k++) slots[k].classList.toggle('on', (showNotes & (1 << (k + 1))) !== 0);
        noteEls[i].hidden = showNotes === 0;
      }
      shownNotes[i] = showNotes;
    }
    const label = labelFor(i, d, given, showNotes, clash);
    if (label !== shownLabel[i]) {
      b.setAttribute('aria-label', label);
      shownLabel[i] = label;
    }
  }

  function buildNotes(i) {
    const box = document.createElement('span');
    box.className = 'zd-notes';
    box.setAttribute('aria-hidden', 'true');
    for (let d = 1; d <= N; d++) {
      const s = document.createElement('span');
      s.className = 'zd-note';
      s.dataset.d = d;
      s.innerHTML = markupCache[d];
      box.appendChild(s);
    }
    cells[i].appendChild(box);
    return box;
  }

  function labelFor(i, d, given, notes, clash) {
    let s = `Row ${rowOf(i) + 1}, column ${colOf(i) + 1}: `;
    if (d) {
      s += symbolName(d, curSkin);
      if (given) s += ', given';
      else if (clash) s += ', clashes';
    } else {
      s += 'empty';
      if (notes) {
        const names = [];
        for (let k = 1; k <= N; k++) if (notes & (1 << k)) names.push(symbolName(k, curSkin));
        s += `, notes: ${names.join(', ')}`;
      }
    }
    return s;
  }

  /** Switch skins: every shown symbol is redrawn, notes included. The
   *  caller then repaints labels by calling renderCell for every cell. */
  function setSkin(s) {
    if (s === curSkin) return;
    curSkin = s;
    markupCache = buildMarkup(s);
    el.dataset.skin = s;
    for (let i = 0; i < total; i++) {
      if (shownD[i] > 0) tiles[i].innerHTML = markupCache[shownD[i]];
      shownLabel[i] = ''; // force the label to be rewritten in the new words
      if (noteEls[i]) {
        const slots = noteEls[i].children;
        for (let k = 0; k < N; k++) slots[k].innerHTML = markupCache[k + 1];
      }
    }
  }
  el.dataset.skin = curSkin;

  // ---- highlights ---------------------------------------------------------------

  let selected = -1;
  let tabStop = 0;

  /** Selection: the cell, its row/column/box shading, and the roving tab stop. */
  function setSelected(i) {
    if (selected >= 0) {
      cells[selected].classList.remove('is-sel');
      cells[selected].removeAttribute('aria-selected');
    }
    selected = i;
    const r = i >= 0 ? rowOf(i) : -1;
    const c = i >= 0 ? colOf(i) : -1;
    const bx = i >= 0 ? boxOf(i) : -1;
    for (let k = 0; k < total; k++) {
      cells[k].classList.toggle('in-unit', i >= 0 && k !== i && (rowOf(k) === r || colOf(k) === c || boxOf(k) === bx));
    }
    if (i >= 0) {
      cells[i].classList.add('is-sel');
      cells[i].setAttribute('aria-selected', 'true');
      setTabStop(i);
    }
  }

  function setTabStop(i) {
    if (i === tabStop) return;
    cells[tabStop].tabIndex = -1;
    cells[i].tabIndex = 0;
    tabStop = i;
  }

  /** Every copy of digit d gets the "same" glow (0 = none). */
  function setFocusDigit(d) {
    if (d > 0) el.dataset.hl = d;
    else delete el.dataset.hl;
  }

  function setConflicts(flags) {
    for (let i = 0; i < total; i++) cells[i].classList.toggle('conflict', flags ? flags[i] === 1 : false);
  }

  let wrongTimer = 0;
  let wrongCells = [];
  /** Mark cells as wrong for a few seconds (the Check button), then fade. */
  function flashWrong(list, ms = 3200) {
    clearWrong();
    wrongCells = list.slice();
    for (const i of wrongCells) restart(cells[i], 'wrong');
    wrongTimer = setTimeout(clearWrong, ms);
  }
  function clearWrong() {
    clearTimeout(wrongTimer);
    for (const i of wrongCells) cells[i].classList.remove('wrong');
    wrongCells = [];
  }

  let hintMarked = [];
  /** Hint overlays: the unit glows, causes get a ring, the focus pulses. */
  function setHint({ unit = [], cause = [], focus = [] } = {}) {
    clearHint();
    for (const i of unit) mark(i, 'hint-unit');
    for (const i of cause) mark(i, 'hint-cause');
    for (const i of focus) mark(i, 'hint-focus');
  }
  function mark(i, cls) {
    if (!(i >= 0 && i < total)) return;
    cells[i].classList.add(cls);
    hintMarked.push(i);
  }
  function clearHint() {
    for (const i of hintMarked) cells[i].classList.remove('hint-unit', 'hint-cause', 'hint-focus');
    hintMarked = [];
  }

  let hover = -1;
  function setHover(i) {
    if (i === hover) return;
    if (hover >= 0) cells[hover].classList.remove('drop-hover');
    hover = i;
    if (i >= 0) cells[i].classList.add('drop-hover');
  }

  let lifting = -1;
  /** The cell an entry is being dragged out of shows an empty dimple. */
  function setLifting(i) {
    if (lifting >= 0) cells[lifting].classList.remove('lifting');
    lifting = i;
    if (i >= 0) cells[i].classList.add('lifting');
  }

  // ---- motion ---------------------------------------------------------------------

  /** Restart a CSS animation class on node even if it is already running. */
  function restart(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth; // the reflow is the restart; only on player actions
    node.classList.add(cls);
  }

  el.addEventListener('animationend', (e) => {
    const t = e.target;
    for (const cls of TRANSIENT) if (t.classList.contains(cls) && e.animationName.startsWith(`zd-${cls}`)) t.classList.remove(cls);
  });

  function wiggle(i) {
    restart(tiles[i], 'wiggle');
  }

  function pop(i) {
    restart(tiles[i], 'pop');
  }

  /** A unit completed correctly: its tiles hop in a quick ripple. */
  function hopUnit(unitCells, stagger = 45) {
    unitCells.forEach((i, k) => {
      tiles[i].style.setProperty('--delay', `${k * stagger}ms`);
      restart(tiles[i], 'hop');
    });
  }

  /** The whole board hops in a diagonal wave; `done` fires once it settles. */
  let waveTimer = 0;
  function solveWave(done) {
    const step = N > 6 ? 40 : 70;
    let last = 0;
    for (let i = 0; i < total; i++) {
      const delay = (rowOf(i) + colOf(i)) * step;
      last = Math.max(last, delay);
      tiles[i].style.setProperty('--delay', `${delay}ms`);
      restart(tiles[i], 'hop');
    }
    clearTimeout(waveTimer);
    waveTimer = setTimeout(done, last + 700);
  }

  // ---- geometry for input ------------------------------------------------------------

  /** The rect drags measure against: the cell grid, padding included, which
   *  is exactly N equal tracks wide (see BOX LINES above). */
  function gridRect() {
    return grid.getBoundingClientRect();
  }

  /** Cell under (x, y) in a cached rect, snapping a point up to half a cell
   *  outside the board onto the edge cell; -1 beyond that (a miss). */
  function cellAt(x, y, rect) {
    const cw = rect.width / N;
    const ch = rect.height / N;
    if (x < rect.left - cw / 2 || x > rect.right + cw / 2) return -1;
    if (y < rect.top - ch / 2 || y > rect.bottom + ch / 2) return -1;
    let c = Math.floor((x - rect.left) / cw);
    let r = Math.floor((y - rect.top) / ch);
    c = c < 0 ? 0 : c >= N ? N - 1 : c;
    r = r < 0 ? 0 : r >= N ? N - 1 : r;
    return r * N + c;
  }

  function focusCell(i) {
    setTabStop(i);
    cells[i].focus({ preventScroll: true });
  }

  function destroy() {
    clearTimeout(wrongTimer);
    clearTimeout(waveTimer);
    el.remove();
  }

  return {
    el,
    grid,
    cells,
    renderCell,
    setSkin,
    setSelected,
    setFocusDigit,
    setConflicts,
    flashWrong,
    clearWrong,
    setHint,
    clearHint,
    setHover,
    setLifting,
    wiggle,
    pop,
    hopUnit,
    solveWave,
    gridRect,
    cellAt,
    focusCell,
    rowOf,
    colOf,
    destroy,
  };
}
