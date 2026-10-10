/*
 * play.js — one board on the table: the board, the tray of pieces under (or
 * beside) it, the toolbar, and the little coach who gives hints.
 *
 * The shell (lane C) calls mountPlay(container, opts) and gets a PlayHandle
 * back, exactly as DESIGN.md §5 describes; it never reaches inside. This file
 * is the referee between the other three in lane B:
 *
 *   game.js   the state (entries, notes, undo) — asked, never bypassed
 *   board.js  the drawing — told what to show, never decides anything
 *   input.js  the gestures — reports taps, drags and keys back to `ctrl`
 *
 * HOW THE INPUT RULES COME OUT (DESIGN §1, "whichever is touched first
 * decides"):
 *   - A picked tray tile (tile first) wins over everything: tapping cells
 *     stamps it; tapping the tile again puts it down; tapping another tile
 *     swaps the pick. Stamping a cell that already holds that piece takes it
 *     off again, so a mis-stamp is undone by the same gesture that made it.
 *   - With nothing picked and a non-given cell selected (cell first), a tray
 *     tap places into that cell. Tapping the piece the cell already holds
 *     takes it off, for the same reason.
 *   - Otherwise a tray tap picks the tile up.
 *   - Erase works on the selected cell; with nothing erasable selected it
 *     becomes a sticky eraser you stamp with, like a tile.
 *   - Notes mode only changes what a placement *means* (a mark instead of a
 *     piece); every gesture stays the same.
 *
 * HINTS (DESIGN §1): one button, three tiers — Nudge (the unit glows),
 * Reason (the causes light up and the coach says why), Show me (it is done
 * for you). Unlimited, uncounted, dismissable at every tier, and any move on
 * the board dismisses a hint, because the board it was about has changed.
 * The engine (hints.js) decides *what*; this file decides which sentence,
 * and js/i18n.js holds the sentence itself in both languages (hint1/hint2,
 * fed one context object from hintCtx below). This file builds that context
 * from the hint's own fields (unit, digits, placements) rather
 * than trusting a particular `text.args` shape, so a change of args in lane A
 * cannot make the coach talk nonsense.
 *
 * "SHOW ME" ON A STEP THAT ONLY ELIMINATES (pairs, pointing, X-wing…), as
 * DESIGN §5 leaves to this lane:
 *   - if notes are offered on this board *and* the player has pencilled at
 *     least one of the eliminated marks, those marks are removed, as one
 *     undoable step — the player sees exactly what the logic rules out, in
 *     the notation they were already using;
 *   - otherwise there is nothing on the board to remove, so Show me places
 *     the first piece the step leads to — hints.js's `then`, worked out by
 *     applying the eliminations and carrying on — or, failing that, the
 *     solution's piece for the first empty cell the step is about. Either
 *     way it is a real placement, and the coach says so ("That leads here")
 *     rather than pretending the eliminations were visible. No auto-fill of
 *     candidates — DESIGN §1 rules that out for v1.
 *
 * LAYOUT. The board is the largest square that fits. Both arrangements are
 * measured — tray and toolbar below (tall) or beside (wide) — and the bigger
 * board wins, so a landscape phone gets the board full height on the left
 * with the controls on the right (hub §2: a menu or a board must not scroll
 * on a sideways phone). The shell's corner buttons are fixed at the top right
 * on every screen (DESIGN §6), so whichever column sits under that corner
 * gets `--corner-top` of headroom, worked out from where the container
 * actually is on screen rather than assumed. Measured on a ResizeObserver,
 * coalesced to one rAF; never per frame.
 */

import { geometry } from './engine.js';
import { nextHint } from './hints.js';
import { symbolMarkup, symbolName, symbolThe, symbolA } from './animals.js';
import { t } from './i18n.js';
import { Game } from './game.js';
import { createBoard } from './board.js';
import { attachInput } from './input.js';

/** Room the shell's #corner-tools needs at the top right (DESIGN §6). */
const CORNER_W = 64;
const CORNER_H = 60;
/** The board's ink rim and the darker lip under it are box-shadows, which
 *  take no layout space; .zd-stage pads for them (board.css) and the board
 *  is sized this much smaller so the lip is never clipped. */
const RIM_X = 6;
const RIM_Y = 14;

// Toolbar glyphs: 24×24, stroked, fill none — the same drawing language as
// the hub's corner icons, so the toolbar and the corner read as one family.
const ICONS = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  erase: 'M7 21h12M5.6 13.4 13 6a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12.2 19H9l-3.4-3.4a1.6 1.6 0 0 1 0-2.2ZM9 10l5 5',
  notes: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
  hint: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z',
  check: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 12.5l3 3 5-6',
};
const TICK = 'M5 12.5l4.5 4.5L19 7';

const icon = (d) =>
  `<svg class="zd-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function mountPlay(container, opts) {
  const puzzle = opts.puzzle;
  const engineGeo = geometry(puzzle.size);
  const N = engineGeo.N || puzzle.size;
  // bh/bw from the engine, falling back to the puzzle's own box so a
  // geometry object without them cannot draw a board with no boxes.
  const geo = {
    N,
    bh: engineGeo.bh || (puzzle.box && puzzle.box.h),
    bw: engineGeo.bw || (puzzle.box && puzzle.box.w),
    units: engineGeo.units,
  };
  const total = N * N;
  let skin = opts.skin === 'numbers' ? 'numbers' : 'animals';
  let settings = { conflicts: true, autoNotes: true, ...(opts.settings || {}) };
  const notesOffered = !!puzzle.notes;

  const safe = (fn) => (...a) => {
    if (typeof fn !== 'function') return undefined;
    try {
      return fn(...a);
    } catch (err) {
      console.error('[zoodoku play] callback failed', err);
      return undefined;
    }
  };
  const sfx = safe(opts.sfx);
  const onChange = safe(opts.onChange);
  const onSolved = safe(opts.onSolved);

  const game = new Game(puzzle, geo, opts.saved || null);
  game.autoNotes = settings.autoNotes !== false;

  let selected = -1;
  let picked = 0; // 1..N a tray tile, -1 the eraser, 0 nothing
  let notesMode = !!(notesOffered && opts.saved && opts.saved.notesMode);
  let paused = false;
  let solving = false;
  let destroyed = false;

  // ---- DOM --------------------------------------------------------------------

  const root = document.createElement('div');
  root.className = 'zd-play';
  root.dataset.size = N;

  const stage = document.createElement('div');
  stage.className = 'zd-stage';
  const board = createBoard(geo, { skin, emphasis: opts.emphasis || null });
  stage.appendChild(board.el);

  const side = document.createElement('div');
  side.className = 'zd-side';

  const coach = document.createElement('div');
  coach.className = 'zd-coach is-empty';
  coach.innerHTML =
    '<p class="zd-coach-text" aria-live="polite"></p>' +
    '<div class="zd-coach-actions">' +
    '<button type="button" class="zd-coach-btn zd-coach-more"></button>' +
    '<button type="button" class="zd-coach-btn zd-coach-ok"></button>' +
    '</div>';
  const coachText = coach.querySelector('.zd-coach-text');
  const coachActions = coach.querySelector('.zd-coach-actions');
  const coachMore = coach.querySelector('.zd-coach-more');
  const coachOk = coach.querySelector('.zd-coach-ok');

  const tray = document.createElement('div');
  tray.className = 'zd-tray';
  tray.setAttribute('role', 'group');
  const trayTiles = [null];
  for (let d = 1; d <= N; d++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'zd-tray-tile';
    b.dataset.d = d;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML =
      '<span class="zd-tile" aria-hidden="true"></span>' +
      '<span class="zd-badge" aria-hidden="true"></span>' +
      `<span class="zd-done" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${TICK}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
    tray.appendChild(b);
    trayTiles.push(b);
  }

  const tools = document.createElement('div');
  tools.className = 'zd-tools';
  tools.setAttribute('role', 'toolbar');
  const tool = (name, pressable) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `zd-tool zd-tool-${name}`;
    b.dataset.tool = name;
    b.innerHTML = `${icon(ICONS[name])}<span class="zd-tool-label"></span>`;
    if (pressable) b.setAttribute('aria-pressed', 'false');
    tools.appendChild(b);
    return b;
  };
  const undoBtn = tool('undo');
  const eraseBtn = tool('erase', true);
  const notesBtn = notesOffered ? tool('notes', true) : null;
  const hintBtn = tool('hint');
  const checkBtn = tool('check');

  /** Every fixed word on the surface, in the current language. Called at
   *  mount and again on `arcade:lang`; the words that change with the game
   *  (tray counts, cell labels, the coach) repaint through their own paths. */
  function paintWords() {
    tools.setAttribute('aria-label', t('tools'));
    for (const b of tools.children) b.querySelector('.zd-tool-label').textContent = t(`tool.${b.dataset.tool}`);
    coachOk.textContent = t('coach.gotIt');
  }
  tools.dataset.count = tools.children.length;

  // The coach lives in a fixed-height slot so a hint appearing never
  // resizes the board. A short line (the tutorial coach, "Everything so far
  // fits") fits the slot; a hint with its buttons grows the bubble downward
  // *over* the tray, which is not needed while the player is reading.
  const coachSlot = document.createElement('div');
  coachSlot.className = 'zd-coach-slot';
  coachSlot.appendChild(coach);
  side.append(coachSlot, tray, tools);
  root.append(stage, side);
  container.appendChild(root);

  // ---- painting -------------------------------------------------------------------

  function renderAll() {
    const flags = settings.conflicts ? game.conflicts() : null;
    const e = game.entries;
    const n = game.notes;
    for (let i = 0; i < total; i++) board.renderCell(i, e[i], game.given[i], n[i], flags ? flags[i] : 0);
    board.setConflicts(flags);
    paintTray();
    paintTools();
    paintFocusDigit();
  }

  function paintTray() {
    tray.setAttribute('aria-label', t('trayLabel', skin));
    for (let d = 1; d <= N; d++) {
      const b = trayTiles[d];
      const left = game.remaining(d);
      b.querySelector('.zd-badge').textContent = left;
      b.classList.toggle('is-done', left === 0);
      b.classList.toggle('is-picked', picked === d);
      b.setAttribute('aria-pressed', picked === d ? 'true' : 'false');
      b.setAttribute('aria-label', t('trayTile', symbolName(d, skin), left));
    }
  }

  function paintTrayArt() {
    for (let d = 1; d <= N; d++) trayTiles[d].querySelector('.zd-tile').innerHTML = symbolMarkup(d, skin);
    tray.dataset.skin = skin;
  }

  function paintTools() {
    undoBtn.disabled = !game.canUndo();
    eraseBtn.setAttribute('aria-pressed', picked === -1 ? 'true' : 'false');
    root.classList.toggle('is-erasing', picked === -1);
    if (notesBtn) notesBtn.setAttribute('aria-pressed', notesMode ? 'true' : 'false');
    root.classList.toggle('is-notes', notesMode);
  }

  function paintFocusDigit() {
    board.setFocusDigit(picked > 0 ? picked : selected >= 0 ? game.entries[selected] : 0);
  }

  function select(i, viaKeyboard = false) {
    selected = i;
    board.setSelected(i);
    if (viaKeyboard && i >= 0) board.focusCell(i);
    paintFocusDigit();
  }

  function setPicked(d) {
    picked = d;
    root.classList.toggle('is-stamping', d !== 0);
    paintTray();
    paintTools();
    paintFocusDigit();
  }

  // ---- moves ------------------------------------------------------------------------

  /** Everything that follows a change to the board, in one place. */
  function afterMove(change, { keepHint = false, quiet = false } = {}) {
    if (!change) return false;
    if (!keepHint) dismissHint();
    board.clearWrong();
    renderAll();
    const flags = settings.conflicts ? game.conflicts() : null;

    // Feedback for the piece just put down: a pop, then either a clash
    // wiggle (on it and on the peer it clashes with) or the unit ripple.
    const placed = change.kind === 'place' || change.kind === 'move' || change.kind === 'many';
    if (placed && !quiet) {
      let clashed = false;
      let any = false;
      for (const i of change.cells) {
        if (!game.entries[i] || game.isGiven(i)) continue;
        any = true;
        board.pop(i);
        if (flags && flags[i]) {
          clashed = true;
          board.wiggle(i);
          for (const p of game.peers[i]) if (game.entries[p] === game.entries[i]) board.wiggle(p);
        }
      }
      sfx(clashed ? 'wiggle' : any ? 'place' : 'clear');
      if (change.completed.length) {
        for (const u of change.completed) board.hopUnit(u.cells);
        sfx('unit');
      }
    } else if (!quiet && change.kind === 'clear') {
      sfx('clear');
    }

    onChange(serialize());
    if (game.isSolved()) solve();
    return true;
  }

  function solve() {
    solving = true;
    input.cancel();
    dismissHint();
    setPicked(0);
    select(-1);
    root.classList.add('is-solved');
    sfx('solve');
    board.solveWave(() => {
      if (!destroyed) onSolved();
    });
  }

  /** Put digit d into cell i in whatever sense the current mode means. */
  function apply(i, d) {
    if (game.isGiven(i)) return null;
    if (notesMode) return afterMove(game.toggleNote(i, d), { quiet: true });
    if (game.entries[i] === d) return afterMove(game.clear(i));
    return afterMove(game.place(i, d));
  }

  function erase(i) {
    return afterMove(game.clear(i));
  }

  function undo() {
    if (solving || paused) return;
    const ch = game.undo();
    if (!ch) return;
    dismissHint();
    board.clearWrong();
    renderAll();
    if (ch.cells.length) select(ch.cells[ch.cells.length - 1]);
    sfx('clear');
    onChange(serialize());
  }

  // ---- the input controller ------------------------------------------------------------

  const enabled = () => !paused && !solving && !destroyed;

  const ctrl = {
    enabled,
    markup: (d) => symbolMarkup(d, skin),

    tapCell(i, viaKeyboard) {
      if (picked !== 0) {
        select(i, viaKeyboard);
        if (game.isGiven(i)) return;
        if (picked === -1) erase(i);
        else apply(i, picked);
        return;
      }
      // A second pointer tap on the selected cell lets go of it; keyboard
      // Enter/Space on it keeps it, since the keyboard always has a cursor.
      if (i === selected && !viaKeyboard) select(-1);
      else select(i, viaKeyboard);
    },

    tapTray(d) {
      if (picked !== 0) {
        const next = picked === d ? 0 : d;
        setPicked(next);
        if (!next) select(-1);
        sfx('pick');
        return;
      }
      if (selected >= 0 && !game.isGiven(selected)) {
        apply(selected, d);
        paintFocusDigit();
        return;
      }
      select(-1);
      setPicked(d);
      sfx('pick');
    },

    dragDigit(kind, src) {
      if (kind === 'tray') return src;
      return !game.isGiven(src) ? game.entries[src] : 0;
    },

    dragStart() {
      sfx('pick');
    },

    /** A drag ended over `cell` (-1 = off the board). Returns what happened
     *  so input.js can animate the ghost: 'placed' | 'cleared' | 'miss'. */
    drop(kind, src, cell) {
      if (kind === 'tray') {
        if (cell < 0 || game.isGiven(cell)) return 'miss';
        if (notesMode) {
          afterMove(game.toggleNote(cell, src), { quiet: true });
          return 'placed';
        }
        afterMove(game.place(cell, src));
        return 'placed';
      }
      // Dragging a placed entry.
      if (cell < 0) {
        erase(src);
        if (selected === src) paintFocusDigit();
        return 'cleared';
      }
      if (cell === src || game.isGiven(cell)) return 'miss';
      afterMove(game.move(src, cell));
      if (selected === src) select(cell);
      return 'placed';
    },

    key(e) {
      if (e.altKey) return false;
      const k = e.key;
      if (e.ctrlKey || e.metaKey) {
        if ((k === 'z' || k === 'Z') && !e.shiftKey) {
          undo();
          return true;
        }
        return false; // every other shortcut belongs to the browser
      }
      if (k.startsWith('Arrow')) {
        let i = selected;
        if (i < 0) i = 0;
        else {
          let r = board.rowOf(i);
          let c = board.colOf(i);
          if (k === 'ArrowUp') r = (r + N - 1) % N;
          else if (k === 'ArrowDown') r = (r + 1) % N;
          else if (k === 'ArrowLeft') c = (c + N - 1) % N;
          else if (k === 'ArrowRight') c = (c + 1) % N;
          i = r * N + c;
        }
        select(i, true);
        return true;
      }
      if (k.length === 1 && k >= '1' && k <= String(N)) {
        const d = +k;
        if (selected >= 0 && !game.isGiven(selected)) {
          apply(selected, d);
          paintFocusDigit();
        } else ctrl.tapTray(d);
        return true;
      }
      if (k === '0' || k === 'Backspace' || k === 'Delete') {
        if (selected >= 0) erase(selected);
        return true;
      }
      if ((k === 'n' || k === 'N') && notesBtn) {
        toggleNotes();
        return true;
      }
      if (k === 'h' || k === 'H') {
        hintPress();
        return true;
      }
      if (k === 'z' || k === 'Z') {
        undo();
        return true;
      }
      return false;
    },
  };

  const input = attachInput({ root, board, tray, ctrl });

  // ---- toolbar -----------------------------------------------------------------------------

  function toggleNotes() {
    notesMode = !notesMode;
    paintTools();
    onChange(serialize());
  }

  undoBtn.addEventListener('click', () => enabled() && undo());
  eraseBtn.addEventListener('click', () => {
    if (!enabled()) return;
    if (picked === 0 && selected >= 0 && !game.isGiven(selected) && (game.entries[selected] || game.notes[selected])) {
      erase(selected);
      return;
    }
    setPicked(picked === -1 ? 0 : -1);
  });
  if (notesBtn) notesBtn.addEventListener('click', () => enabled() && toggleNotes());
  hintBtn.addEventListener('click', () => enabled() && hintPress());
  checkBtn.addEventListener('click', () => enabled() && check());

  /** Check: mark wrong entries once; they fade on their own (DESIGN §1). */
  function check() {
    dismissHint();
    if (!game.hasEntries()) return say(() => t('check.nothing'));
    const wrong = game.wrongCells();
    if (wrong.length) {
      board.flashWrong(wrong);
      sfx('wiggle');
      say(() => t('checkWrong', wrong.length));
    } else {
      say(() => t('check.fine'));
    }
  }

  // ---- coach ----------------------------------------------------------------------------------

  /*
   * EVERY COACH LINE IS A FUNCTION, not a string: () => t(...). The coach
   * keeps the last pair it was handed and calls them again on `arcade:lang`,
   * so a hint half-read in Norwegian finishes in English the moment the
   * player switches — same hint, same tier, nothing recomputed. opts.coach
   * may be either (the shell passes a function for the same reason).
   */
  const line = (x) => (typeof x === 'function' ? x : () => x || '');
  /** The line the coach goes back to when a hint or a remark is done. */
  const standing = line(opts.coachFades ? '' : opts.coach);
  let sayTimer = 0;
  let coachNow = { text: standing, more: null };
  /** A short coach line with no buttons, which goes away by itself. */
  function say(text, ms = 3200) {
    showCoach(text, null);
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => {
      if (!hint) showCoach(standing, null);
    }, ms);
  }

  function showCoach(text, more) {
    coachNow = { text: line(text), more: more ? line(more) : null };
    paintCoach();
  }

  function paintCoach() {
    const text = coachNow.text();
    const more = coachNow.more ? coachNow.more() : '';
    coachText.textContent = text;
    coach.classList.toggle('is-empty', !text);
    coach.classList.toggle('is-hint', !!hint);
    coachActions.hidden = !hint;
    coachMore.hidden = !more;
    if (more) coachMore.textContent = more;
  }

  coachMore.addEventListener('click', () => enabled() && hintPress());
  coachOk.addEventListener('click', () => dismissHint());

  // ---- hints ------------------------------------------------------------------------------------

  let hint = null;
  let tier = 0;

  function computeHint() {
    let h = null;
    try {
      h = nextHint(puzzle, Array.from(game.entries));
    } catch (err) {
      console.error('[zoodoku play] nextHint failed', err);
    }
    if (h) return h;
    // The engine had nothing (or failed): still never leave a player stuck.
    const wrong = game.wrongCells();
    if (wrong.length) return { kind: 'wrong', cells: wrong };
    for (let i = 0; i < total; i++) if (!game.entries[i]) return { kind: 'reveal', cell: i };
    return null;
  }

  function hintPress() {
    if (solving) return;
    clearTimeout(sayTimer);
    if (!hint || tier >= 3) {
      hint = computeHint();
      tier = 1;
      if (!hint) return say(() => t('hint.none'));
    } else tier++;
    sfx('hint');
    showHintTier();
  }

  function dismissHint() {
    if (!hint) return;
    hint = null;
    tier = 0;
    board.clearHint();
    showCoach(standing, null);
  }

  // Unit types from techniques.js: the three real units, plus 'cell' (a
  // naked single) and 'group' (fish and wings), which have no one word.
  const UNIT_TYPES = ['row', 'col', 'box', 'cell', 'group'];

  /** 'row' if all cells share a row, 'col' if a column, else null. */
  function lineOf(cells) {
    if (!cells || cells.length < 2) return null;
    if (cells.every((c) => board.rowOf(c) === board.rowOf(cells[0]))) return 'row';
    if (cells.every((c) => board.colOf(c) === board.colOf(cells[0]))) return 'col';
    return null;
  }

  function hintDigits(h) {
    const ds = [];
    const push = (d) => d >= 1 && d <= N && !ds.includes(d) && ds.push(d);
    (h.digits || []).forEach(push);
    (h.placements || []).forEach((p) => push(p.digit));
    (h.eliminations || []).forEach((p) => push(p.digit));
    const args = (h.text && h.text.args) || {};
    push(args.d);
    (Array.isArray(args.ds) ? args.ds : []).forEach(push);
    return ds;
  }

  /**
   * What a hint sentence needs, as TYPES and finished noun phrases — never
   * a sentence. js/i18n.js does the grammar: English says "the fox", bokmål
   * "reven"; English "this row", bokmål "denne raden". Read at paint time,
   * so a skin or language switch mid-hint changes the words and not the hint.
   */
  function hintCtx(h) {
    const ds = hintDigits(h);
    const d = ds[0] || 0;
    const args = (h.text && h.text.args) || {};
    const ut = h.unit && h.unit.type;
    const lineType = args.lineType || ut;
    const lines = lineType === 'col' ? 'cols' : 'rows';
    const lt = args.lineType === 'row' || args.lineType === 'col' ? args.lineType : null;
    return {
      d,
      the: d ? symbolThe(d, skin) : '',
      a: d ? symbolA(d, skin) : '',
      as: ds.map((x) => symbolA(x, skin)),
      unit: UNIT_TYPES.includes(ut) ? ut : 'area',
      line: lt || lineOf(h.patternCells) || lineOf(h.focusCells) || 'line',
      lines,
      cross: lines === 'rows' ? 'cols' : 'rows',
    };
  }

  /** The coach's words for hint h at tier tr (1 nudge, 2 reason). */
  function words(h, tr) {
    if (h.kind === 'wrong') return tr === 1 ? t('hint.wrong1') : t('hintWrong2', h.cells.length);
    if (h.kind === 'reveal') return tr === 1 ? t('hint.look') : t('hint.revealWhy');
    const key = (h.text && h.text.key) || h.technique || '';
    return t(tr === 1 ? 'hint1' : 'hint2', key, hintCtx(h));
  }

  function showHintTier() {
    const h = hint;
    if (h.kind === 'wrong') {
      if (tier === 1) {
        board.clearHint();
        showCoach(() => words(h, 1), () => t('coach.which'));
      } else if (tier === 2) {
        board.setHint({ focus: h.cells });
        board.flashWrong(h.cells, 6000);
        showCoach(() => words(h, 2), () => t('takeOff', h.cells.length));
      } else {
        afterMove(game.clearMany(h.cells), { keepHint: true });
        finishHint(() => t('hint.gone'));
      }
      return;
    }
    if (h.kind === 'reveal') {
      if (tier < 3) {
        board.setHint({ focus: [h.cell] });
        const tr = tier;
        showCoach(() => words(h, tr), () => t(tr === 1 ? 'coach.more' : 'coach.show'));
      } else {
        const d = game.solution[h.cell];
        afterMove(game.place(h.cell, d), { keepHint: true });
        finishHint(() => t('hintThere', symbolA(d, skin)));
      }
      return;
    }
    const unitCells = (h.unit && h.unit.cells) || [];
    if (tier === 1) {
      board.setHint({ unit: unitCells.length ? unitCells : h.patternCells || [], focus: unitCells.length ? [] : h.focusCells || [] });
      showCoach(() => words(h, 1), () => t('coach.more'));
    } else if (tier === 2) {
      // Focus is only where the answer lands: patternCells for a single is
      // the whole unit, which is already glowing, and ringing all of it
      // would drown the one square that matters.
      board.setHint({ unit: unitCells, cause: h.causeCells || [], focus: h.focusCells || [] });
      showCoach(() => words(h, 2), () => t('coach.show'));
    } else {
      showMe(h);
    }
  }

  function showMe(h) {
    const placements = h.placements || [];
    if (placements.length) {
      afterMove(game.placeMany(placements), { keepHint: true });
      const d = placements[0].digit;
      return finishHint(() => (placements.length === 1 ? t('hintInGoes', symbolThe(d, skin)) : t('hint.inTheyGo')));
    }
    const elims = h.eliminations || [];
    if (notesOffered && elims.some(({ cell, digit }) => game.notes[cell] & (1 << digit))) {
      afterMove(game.removeNotes(elims), { keepHint: true, quiet: true });
      return finishHint(() => t('hint.notesOff'));
    }
    // Nothing pencilled to remove: place what the step leads to (see the
    // purpose block, "SHOW ME ON A STEP THAT ONLY ELIMINATES"). hints.js
    // works that out as `then`; the pool below is only a fallback.
    if (h.then && !game.entries[h.then.cell] && !game.isGiven(h.then.cell)) {
      const d = h.then.digit;
      afterMove(game.place(h.then.cell, d), { keepHint: true });
      return finishHint(() => t('hintLeads', symbolA(d, skin)));
    }
    const pool = elims.map((x) => x.cell).concat(h.focusCells || [], (h.unit && h.unit.cells) || []);
    let cell = pool.find((i) => !game.entries[i]);
    if (cell === undefined) for (let i = 0; i < total && cell === undefined; i++) if (!game.entries[i]) cell = i;
    if (cell === undefined) return dismissHint();
    const d = game.solution[cell];
    afterMove(game.place(cell, d), { keepHint: true });
    finishHint(() => t('hintLeads', symbolA(d, skin)));
  }

  /** Tier 3 is done: say so, keep "Got it", and let the next Hint press
   *  start a fresh hint (tier stays at 3, which hintPress reads as "new"). */
  function finishHint(text) {
    if (!hint) return;
    board.clearHint();
    tier = 3;
    showCoach(text, null);
  }

  // ---- layout ---------------------------------------------------------------------------------------

  let rafLayout = 0;
  function layout() {
    rafLayout = 0;
    if (destroyed) return;
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (W < 60 || H < 60) return;
    const pad = Math.round(Math.max(8, Math.min(18, Math.min(W, H) * 0.025)));
    // How far the shell's corner reaches into this container. Measured from
    // #corner-tools when it is on the page (the shell's play head already
    // keeps it clear, so this is normally 0); assumed from CORNER_W/H when
    // it is not, so a container placed anywhere is still safe.
    const r = root.getBoundingClientRect();
    const cornerEl = document.getElementById('corner-tools');
    const cr = cornerEl && cornerEl.offsetParent !== null ? cornerEl.getBoundingClientRect() : null;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const cLeft = cr ? cr.left : vw - CORNER_W;
    const cBottom = cr ? cr.bottom + 6 : CORNER_H;
    const cornerW = Math.max(0, Math.round(r.right - cLeft));
    const cornerTop = cornerW > 0 ? Math.max(0, Math.round(cBottom - r.top)) : 0;
    root.style.setProperty('--pad', `${pad}px`);
    root.classList.remove('is-squeezed', 'is-tight');

    // Tall: controls below, measured at full width.
    root.dataset.mode = 'tall';
    root.style.setProperty('--corner-top', '0px');
    side.style.width = '';
    setTrayCols(W - 2 * pad);
    const sideH = side.offsetHeight;
    const room = H - sideH - 3 * pad - RIM_Y;
    let tallB = Math.min(W - 2 * pad - RIM_X, room);
    let tallTop = 0;
    if (cornerTop && (W - tallB) / 2 < cornerW) {
      // Either drop the board below the corner, or narrow it so it fits
      // between the corner and its mirror; whichever leaves it bigger.
      const below = Math.min(W - 2 * pad - RIM_X, room - cornerTop);
      const narrow = Math.min(W - 2 * cornerW - RIM_X, room);
      if (narrow >= below) tallB = narrow;
      else {
        tallB = below;
        tallTop = cornerTop;
      }
    }

    // Wide: board full height on the left, controls in a column on the right.
    const sideW = Math.max(200, Math.min(380, W * 0.36));
    const wideB = Math.min(H - 2 * pad - RIM_Y, W - sideW - 3 * pad - RIM_X);

    let b;
    if (wideB > tallB + 12) {
      b = wideB;
      root.dataset.mode = 'wide';
      const sw = Math.min(480, W - b - RIM_X - 3 * pad);
      side.style.width = `${sw}px`;
      root.style.setProperty('--corner-top', `${cornerTop}px`);
      setTrayCols(sw);
      if (sideNeed() > H - 2 * pad) {
        // Too tall beside the board (a short landscape phone): compact the
        // controls rather than shrink the board, which is the thing played.
        root.classList.add('is-squeezed');
        setTrayCols(sw, 38);
        // Still too tall: give up the coach's reserved slot. The bubble then
        // floats over the top of the tray while it has something to say.
        if (sideNeed() > H - 2 * pad) root.classList.add('is-tight');
      }
    } else {
      b = tallB;
      root.style.setProperty('--corner-top', `${tallTop}px`);
      setTrayCols(W - 2 * pad);
    }
    b = Math.max(120, Math.floor(b));
    root.style.setProperty('--board-px', `${b}px`);
    root.style.setProperty('--cell-px', `${(b / N).toFixed(2)}px`);
  }

  /** The side column's natural height. In wide mode it is stretched to the
   *  full height, so its offsetHeight says nothing; let go of the stretch
   *  for one read. Only called from layout(), on a resize. */
  function sideNeed() {
    side.style.alignSelf = 'flex-start';
    const h = side.offsetHeight;
    side.style.alignSelf = '';
    return h;
  }

  /** One row of N tiles when each can be at least `min` px; else two rows. */
  function setTrayCols(width, min = 42) {
    const gap = 8;
    const cols = (width - (N - 1) * gap) / N >= min ? N : Math.ceil(N / 2);
    root.style.setProperty('--tray-cols', cols);
  }

  const ro = new ResizeObserver(() => {
    if (!rafLayout) rafLayout = requestAnimationFrame(layout);
  });
  ro.observe(root);

  // ---- first paint --------------------------------------------------------------------------------

  paintWords();
  paintTrayArt();
  renderAll();
  // A tutorial coach stands for the whole board; a "bigger boxes now" note
  // (opts.coachFades) says its piece once and goes, or it would sit above
  // the tray for every move of a 9×9.
  if (opts.coachFades && opts.coach) say(line(opts.coach), 8000);
  else showCoach(standing, null);
  layout();

  /*
   * A language switch (js/i18n.js, `arcade:lang`), live: the fixed words,
   * the board's and tray's labels, and whatever the coach is saying right
   * now — in place, without touching the game, the hint tier or a pause.
   * Norwegian words run longer, so the layout is measured again too.
   */
  function onLang() {
    if (destroyed) return;
    paintWords();
    board.relabel();
    renderAll();
    paintCoach();
    if (!rafLayout) rafLayout = requestAnimationFrame(layout);
  }
  document.addEventListener('arcade:lang', onLang);

  // ---- the handle --------------------------------------------------------------------------------------

  function serialize() {
    return { ...game.serialize(), notesMode };
  }

  return {
    setSkin(s) {
      const next = s === 'numbers' ? 'numbers' : 'animals';
      if (next === skin) return;
      skin = next;
      board.setSkin(skin);
      paintTrayArt();
      renderAll();
      if (hint && tier < 3) showHintTier();
    },
    setSettings(s) {
      settings = { ...settings, ...(s || {}) };
      game.autoNotes = settings.autoNotes !== false;
      renderAll();
    },
    restart() {
      solving = false;
      root.classList.remove('is-solved');
      dismissHint();
      board.clearWrong();
      game.restart();
      setPicked(0);
      select(-1);
      renderAll();
      onChange(serialize());
    },
    undo,
    serialize,
    pause() {
      paused = true;
      input.cancel();
      root.classList.add('is-paused');
    },
    resume() {
      paused = false;
      root.classList.remove('is-paused');
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      document.removeEventListener('arcade:lang', onLang);
      clearTimeout(sayTimer);
      if (rafLayout) cancelAnimationFrame(rafLayout);
      ro.disconnect();
      input.destroy();
      board.destroy();
      root.remove();
    },
  };
}
