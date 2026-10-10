/*
 * input.js — fingers, mice and keys on the play surface.
 *
 * DESIGN §1 asks for hybrid input with no mode switch: drag a tray tile onto
 * a cell, drag a placed entry to move or clear it, tap a cell then a tile, or
 * tap a tile then stamp cells — whichever is touched first decides. This
 * file only *recognises* those gestures; what each one means (place, note,
 * pick, stamp) is play.js's business, through the `ctrl` callbacks.
 *
 * TAP vs DRAG. Pointer Events only, one code path for mouse, pen and touch
 * (hub §10). A press becomes a drag once it travels past a small threshold
 * (larger for a finger, which wobbles); a press that never does is a tap,
 * and taps are read from the native `click` on the button — not from
 * pointerup — so Enter and Space on a focused cell or tile are the very same
 * code path as a finger. After a drag, the click a browser may still fire is
 * swallowed by timestamp.
 *
 * Pointer capture is taken only when a drag *starts*, never on pointerdown.
 * That is deliberate: in current Chrome a captured pointer's click is aimed
 * at the capturing element, so capturing on every press would turn every tap
 * on a cell into a click on the surface and taps would silently die.
 *
 * THE GHOST. A dragged piece is drawn by one element, made once and reused,
 * living on <body> with `position: fixed` (a transformed ancestor in the
 * shell's screen transitions would otherwise make "fixed" relative to that).
 * It is lifted and enlarged ~1.3× and drawn ~0.6 of a cell *above* the
 * finger, so the finger never hides what it carries, while the drop point
 * stays the finger itself — the cell under the fingertip is the one that
 * lights up and the one that gets the piece. Position updates are coalesced
 * into one requestAnimationFrame callback, bound once.
 *
 * A miss (released more than half a cell outside the board, or on a given)
 * flies back to where it came from: a tray tile to its tile, an entry off
 * the board is cleared — that is how you take a piece away — and an entry
 * dropped on a given goes home to its own cell untouched. pointercancel (a
 * system gesture, a call coming in) undoes the lift and does nothing else.
 */

const TAP_SLOP_MOUSE = 6;
const TAP_SLOP_TOUCH = 10;
const LIFT_SCALE = 1.3;
const LIFT_ABOVE = 0.6; // of a cell
const CLICK_SWALLOW_MS = 450;

/**
 * @param {object} o
 * @param {HTMLElement} o.root   the play surface (touch-action: none)
 * @param {object} o.board       createBoard() handle
 * @param {HTMLElement} o.tray   tray container; tiles carry data-d
 * @param {object} o.ctrl        play.js callbacks:
 *   enabled() → bool, tapCell(i), tapTray(d), dragDigit(kind, src) → digit|0,
 *   dragStart(kind, src), drop(kind, src, cell /* -1 = miss *\/),
 *   key(e) → bool handled, markup(d) → svg string
 */
export function attachInput({ root, board, tray, ctrl }) {
  let active = null; // { id, kind:'tray'|'cell', src, x0, y0, slop, dragging, digit }
  let rect = null; // board grid rect, cached for the length of one drag
  let cellPx = 40;
  let px = 0;
  let py = 0;
  let raf = 0;
  let swallowUntil = 0;

  // ---- the ghost -------------------------------------------------------------
  const ghost = document.createElement('div');
  ghost.className = 'zd-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.hidden = true;
  const ghostTile = document.createElement('span');
  ghostTile.className = 'zd-tile';
  ghost.appendChild(ghostTile);
  document.body.appendChild(ghost);

  const paint = () => {
    raf = 0;
    const s = cellPx;
    ghost.style.transform = `translate3d(${px - s / 2}px, ${py - LIFT_ABOVE * s - s / 2}px, 0) scale(${LIFT_SCALE})`;
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(paint);
  };

  function showGhost(d, x, y) {
    ghost.classList.remove('flying', 'poof');
    ghostTile.innerHTML = ctrl.markup(d);
    ghost.style.width = ghost.style.height = `${cellPx}px`;
    ghost.dataset.skin = board.el.dataset.skin || '';
    ghost.hidden = false;
    px = x;
    py = y;
    paint();
  }

  let ghostTimer = 0;
  /** Send the ghost to a screen rect (a tray tile, a home cell) and hide it. */
  function flyBack(target) {
    if (!target) return hideGhost();
    const r = target.getBoundingClientRect();
    const s = cellPx;
    ghost.classList.add('flying');
    ghost.style.transform = `translate3d(${r.left + r.width / 2 - s / 2}px, ${r.top + r.height / 2 - s / 2}px, 0) scale(${Math.min(r.width, r.height) / s})`;
    clearTimeout(ghostTimer);
    ghostTimer = setTimeout(hideGhost, 260);
  }
  function poof() {
    ghost.classList.add('poof');
    clearTimeout(ghostTimer);
    ghostTimer = setTimeout(hideGhost, 220);
  }
  function hideGhost() {
    clearTimeout(ghostTimer);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ghost.hidden = true;
    ghost.classList.remove('flying', 'poof');
  }

  // ---- pointer ---------------------------------------------------------------

  function onDown(e) {
    if (active || !e.isPrimary || e.button > 0 || !ctrl.enabled()) return;
    const t = e.target;
    const tile = t.closest && t.closest('.zd-tray-tile');
    const cell = !tile && t.closest && t.closest('.zd-cell');
    let kind;
    let src;
    if (tile && tray.contains(tile)) {
      kind = 'tray';
      src = +tile.dataset.d;
    } else if (cell && board.el.contains(cell)) {
      kind = 'cell';
      src = +cell.dataset.i;
    } else return;
    active = {
      id: e.pointerId,
      kind,
      src,
      x0: e.clientX,
      y0: e.clientY,
      slop: e.pointerType === 'mouse' ? TAP_SLOP_MOUSE : TAP_SLOP_TOUCH,
      dragging: false,
      digit: 0,
    };
  }

  function onMove(e) {
    if (!active || e.pointerId !== active.id) return;
    if (!active.dragging) {
      const dx = e.clientX - active.x0;
      const dy = e.clientY - active.y0;
      if (dx * dx + dy * dy < active.slop * active.slop) return;
      // Only tray tiles and placed entries can be picked up; a press on an
      // empty cell or a given that wanders is still just a (cancelled) tap.
      const d = ctrl.dragDigit(active.kind, active.src);
      if (!d) {
        active = null;
        return;
      }
      active.dragging = true;
      active.digit = d;
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        /* an already-released pointer: the drag still works on bubbling moves */
      }
      rect = board.gridRect();
      cellPx = Math.max(28, rect.width / board.cells.length ** 0.5);
      showGhost(d, e.clientX, e.clientY);
      if (active.kind === 'cell') board.setLifting(active.src);
      ctrl.dragStart(active.kind, active.src);
    }
    px = e.clientX;
    py = e.clientY;
    schedule();
    board.setHover(board.cellAt(px, py, rect));
  }

  function onUp(e) {
    if (!active || e.pointerId !== active.id) return;
    const a = active;
    active = null;
    if (!a.dragging) return; // a tap: the native click handles it
    swallowUntil = performance.now() + CLICK_SWALLOW_MS;
    const target = board.cellAt(e.clientX, e.clientY, rect);
    finishDrag(a, target, false);
  }

  function onCancel(e) {
    if (!active || e.pointerId !== active.id) return;
    const a = active;
    active = null;
    if (a.dragging) {
      swallowUntil = performance.now() + CLICK_SWALLOW_MS;
      finishDrag(a, -1, true);
    }
  }

  /** End a drag. `cancelled` means the system took the pointer away: put
   *  everything back exactly as it was and make no move at all. */
  function finishDrag(a, target, cancelled) {
    board.setHover(-1);
    board.setLifting(-1);
    rect = null;
    const home = a.kind === 'tray' ? tray.querySelector(`[data-d="${a.src}"]`) : board.cells[a.src];
    if (cancelled) return flyBack(home);
    const result = ctrl.drop(a.kind, a.src, target);
    // play.js answers 'placed' | 'cleared' | 'miss'.
    if (result === 'placed') hideGhost();
    else if (result === 'cleared') poof();
    else flyBack(home);
  }

  // ---- taps (native click, so keyboard activation is the same path) ------------

  function onBoardClick(e) {
    const cell = e.target.closest && e.target.closest('.zd-cell');
    if (!cell || performance.now() < swallowUntil || !ctrl.enabled()) return;
    ctrl.tapCell(+cell.dataset.i, e.detail === 0);
  }

  function onTrayClick(e) {
    const tile = e.target.closest && e.target.closest('.zd-tray-tile');
    if (!tile || performance.now() < swallowUntil || !ctrl.enabled()) return;
    ctrl.tapTray(+tile.dataset.d);
  }

  // ---- keyboard ------------------------------------------------------------------
  // On the document, because after tapping a toolbar button Safari leaves
  // focus on <body>, and N or Z should still work. Ignored when focus is in a
  // text field or anywhere outside the play surface (the shell's pause menu
  // has its own keys), and never for Escape, which the shell owns.

  function onKey(e) {
    if (e.key === 'Escape' || !ctrl.enabled()) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (t && t !== document && t !== document.body && t !== document.documentElement && !root.contains(t)) return;
    if (ctrl.key(e)) e.preventDefault();
  }

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onCancel);
  board.el.addEventListener('click', onBoardClick);
  tray.addEventListener('click', onTrayClick);
  document.addEventListener('keydown', onKey);

  return {
    /** Drop any drag in flight without making a move (pause, destroy). */
    cancel() {
      if (active && active.dragging) finishDrag(active, -1, true);
      active = null;
    },
    destroy() {
      this.cancel();
      hideGhost();
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onCancel);
      board.el.removeEventListener('click', onBoardClick);
      tray.removeEventListener('click', onTrayClick);
      document.removeEventListener('keydown', onKey);
      ghost.remove();
    },
  };
}
