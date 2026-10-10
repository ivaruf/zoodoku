/*
 * game.js — the state of one board in play, and nothing else.
 *
 * No DOM, no timers, no engine calls: this file is the bookkeeping a
 * player's moves are made of, so it can be exercised from `node -e` with a
 * hand-built 4×4 and trusted by the three files that draw and drive it
 * (board.js, input.js, play.js — DESIGN.md §4, lane B).
 *
 * WHAT IT HOLDS
 *   entries   Int8Array(N*N), 0 = empty, givens included and locked. The
 *             hint engine reads exactly this array (DESIGN §5 nextHint).
 *   notes     Uint16Array(N*N), bit d set = pencil mark for digit d. A bitmask
 *             because a cell holds at most nine marks and a toggle is one XOR.
 *   history   the undo stack, unlimited (DESIGN §1: "Unlimited undo").
 *
 * HOW UNDO WORKS. Every move records, for each cell it touched, the cell's
 * entry and notes *before* the move, as flat triples [cell, entry, notes, …].
 * Undo writes them back in reverse order. That one shape covers every kind of
 * move — place, clear, move, note, a hint that places or prunes several cells
 * at once, and the peer-note cleanup autoNotes does on a placement — so there
 * is no per-kind inverse to get wrong, and a placement plus the notes it
 * swept away comes back as one step, which is what a player means by "undo".
 *
 * WHAT IT DOES NOT DO. It never refuses a legal-looking placement: any digit
 * may go in any non-given cell (DESIGN §1, "Any placement is allowed"). It
 * only refuses to touch a given. Conflicts and wrongness are *questions* the
 * surface asks (conflicts(), wrongCells()), never gates.
 *
 * GEOMETRY. The constructor takes the engine's geometry(size) object and
 * reads only `N` and `units` ({type, index, cells}) from it, deriving every
 * cell→unit and peer table itself. Deliberately: the units list is the one
 * part of that object whose shape DESIGN §5 spells out, so this file does not
 * depend on whether rowOf/peers are arrays, functions or Sets.
 */

const SAVE_VERSION = 1;

export class Game {
  /**
   * @param {object} puzzle  { size, givens, solution, … } (DESIGN §5 Puzzle)
   * @param {object} geo     geometry(size): { N, units:[{type,index,cells}] }
   * @param {object|null} saved  a previous serialize(), or null
   */
  constructor(puzzle, geo, saved = null) {
    const N = geo.N || puzzle.size;
    const total = N * N;
    this.N = N;
    this.total = total;
    this.units = geo.units;
    this.solution = Int8Array.from(puzzle.solution);
    this.given = new Uint8Array(total);
    this.givens = Int8Array.from(puzzle.givens);
    for (let i = 0; i < total; i++) this.given[i] = this.givens[i] > 0 ? 1 : 0;
    this.entries = Int8Array.from(this.givens);
    this.notes = new Uint16Array(total);
    this.history = [];
    /** Placing a digit removes that digit's notes from its peers (setting). */
    this.autoNotes = true;
    /** Units that the most recent forward move completed *correctly*. */
    this.completed = [];

    // cell → the units it sits in, and cell → its peers (every other cell
    // sharing one of those units), built once.
    this.cellUnits = Array.from({ length: total }, () => []);
    for (const u of this.units) for (const c of u.cells) this.cellUnits[c].push(u);
    this.peers = Array.from({ length: total }, (_, i) => {
      const seen = new Set();
      for (const u of this.cellUnits[i]) for (const c of u.cells) if (c !== i) seen.add(c);
      return Int16Array.from(seen);
    });

    // Scratch reused by conflicts() so a question asked after every move
    // does not allocate (the caller copies what it wants to keep).
    this._conf = new Uint8Array(total);
    this._count = new Int8Array(N + 1);

    if (saved) this.restore(saved);
  }

  // ---- the moves ----------------------------------------------------------
  // Each returns a Change { cells: number[] touched, completed: unit[] } or
  // null when nothing changed (a given, or a no-op), so the surface can
  // tell "nothing happened" apart from "something did" without diffing.

  /** Put digit d (1..N) in cell i. Replaces whatever entry was there. */
  place(i, d) {
    if (!this._editable(i) || !(d >= 1 && d <= this.N)) return null;
    if (this.entries[i] === d) return null;
    const rec = [];
    this._write(i, d, 0, rec); // an entry hides and discards its own notes
    if (this.autoNotes) this._sweepPeers(i, d, rec);
    return this._commit('place', rec, [i]);
  }

  /** Empty cell i: removes an entry, or, on an empty cell, its notes. */
  clear(i) {
    if (!this._editable(i)) return null;
    if (this.entries[i] === 0 && this.notes[i] === 0) return null;
    const rec = [];
    this._write(i, 0, 0, rec);
    return this._commit('clear', rec, []);
  }

  /** Drag an entry from cell a onto cell b. b's previous content is lost. */
  move(a, b) {
    if (a === b || !this._editable(a) || !this._editable(b)) return null;
    const d = this.entries[a];
    if (!d) return null;
    const rec = [];
    this._write(a, 0, 0, rec);
    this._write(b, d, 0, rec);
    if (this.autoNotes) this._sweepPeers(b, d, rec);
    return this._commit('move', rec, [b]);
  }

  /** Toggle pencil mark d in cell i. Only on an empty cell: a mark under an
   *  entry would be invisible, and a toggle you cannot see is a lie. */
  toggleNote(i, d) {
    if (!this._editable(i) || this.entries[i] !== 0 || !(d >= 1 && d <= this.N)) return null;
    const rec = [];
    this._write(i, 0, this.notes[i] ^ (1 << d), rec);
    return this._commit('note', rec, []);
  }

  /** Several placements as one undoable step (a hint's "Show me"). */
  placeMany(list) {
    const rec = [];
    const placed = [];
    for (const { cell, digit } of list) {
      if (!this._editable(cell) || !(digit >= 1 && digit <= this.N)) continue;
      if (this.entries[cell] === digit) continue;
      this._write(cell, digit, 0, rec);
      if (this.autoNotes) this._sweepPeers(cell, digit, rec);
      placed.push(cell);
    }
    return rec.length ? this._commit('many', rec, placed) : null;
  }

  /** Several clears as one step (the wrong-entry hint's "Take it off"). */
  clearMany(cells) {
    const rec = [];
    for (const i of cells) if (this._editable(i) && (this.entries[i] || this.notes[i])) this._write(i, 0, 0, rec);
    return rec.length ? this._commit('many', rec, []) : null;
  }

  /** Remove pencil marks [{cell, digit}] as one step (an elimination hint). */
  removeNotes(list) {
    const rec = [];
    for (const { cell, digit } of list) {
      if (!this._editable(cell) || !(this.notes[cell] & (1 << digit))) continue;
      this._write(cell, this.entries[cell], this.notes[cell] & ~(1 << digit), rec);
    }
    return rec.length ? this._commit('notes', rec, []) : null;
  }

  /** Step back one move. Returns a Change (cells touched) or null. */
  undo() {
    const op = this.history.pop();
    this.completed = [];
    if (!op) return null;
    const c = op.c;
    const cells = [];
    // Reverse order, so a cell touched twice in one move ends at its oldest value.
    for (let k = c.length - 3; k >= 0; k -= 3) {
      const i = c[k];
      this.entries[i] = c[k + 1];
      this.notes[i] = c[k + 2];
      cells.push(i);
    }
    return { kind: op.k, cells, completed: [] };
  }

  /** Back to the givens. The undo stack goes too: "restart" is a fresh
   *  start, and an undo that resurrected the old board would contradict it. */
  restart() {
    this.entries.set(this.givens);
    this.notes.fill(0);
    this.history.length = 0;
    this.completed = [];
  }

  // ---- questions ------------------------------------------------------------

  /** Flags (1 = clashing) for every cell holding a digit that a peer also
   *  holds. Shared scratch buffer: valid until the next call, copy to keep. */
  conflicts() {
    const out = this._conf;
    const count = this._count;
    const e = this.entries;
    out.fill(0);
    for (const u of this.units) {
      count.fill(0);
      for (const c of u.cells) if (e[c]) count[e[c]]++;
      for (const c of u.cells) if (e[c] && count[e[c]] > 1) out[c] = 1;
    }
    return out;
  }

  /** Player entries that differ from the solution. Givens are never wrong. */
  wrongCells() {
    const out = [];
    for (let i = 0; i < this.total; i++) {
      if (!this.given[i] && this.entries[i] && this.entries[i] !== this.solution[i]) out.push(i);
    }
    return out;
  }

  /** How many of digit d are still to place: N minus copies on the board,
   *  never below 0 (an over-placed digit is a conflict, not a debt). */
  remaining(d) {
    let n = 0;
    for (let i = 0; i < this.total; i++) if (this.entries[i] === d) n++;
    return Math.max(0, this.N - n);
  }

  /** Does the player have any entries of their own on the board? */
  hasEntries() {
    for (let i = 0; i < this.total; i++) if (!this.given[i] && this.entries[i]) return true;
    return false;
  }

  isSolved() {
    for (let i = 0; i < this.total; i++) if (this.entries[i] !== this.solution[i]) return false;
    return true;
  }

  canUndo() {
    return this.history.length > 0;
  }

  isGiven(i) {
    return this.given[i] === 1;
  }

  // ---- save and restore -----------------------------------------------------

  serialize() {
    return {
      v: SAVE_VERSION,
      entries: Array.from(this.entries),
      notes: Array.from(this.notes),
      history: this.history.map((op) => [op.k, op.c]),
    };
  }

  /** Take a serialize() back. Anything malformed is dropped rather than
   *  trusted — storage is shared by every game on the origin (hub §6) — and
   *  givens always win over whatever the save says about their cells. A bad
   *  history is thrown away on its own, keeping the board: losing undo is a
   *  small cost, losing a half-solved 9×9 is not. */
  restore(s) {
    if (!s || typeof s !== 'object') return false;
    const { N, total } = this;
    const okInt = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
    if (Array.isArray(s.entries) && s.entries.length === total && s.entries.every((v) => okInt(v, N))) {
      for (let i = 0; i < total; i++) this.entries[i] = this.given[i] ? this.givens[i] : s.entries[i];
    } else {
      return false;
    }
    const maxMask = (1 << (N + 1)) - 2;
    if (Array.isArray(s.notes) && s.notes.length === total && s.notes.every((v) => okInt(v, maxMask))) {
      for (let i = 0; i < total; i++) this.notes[i] = this.given[i] || this.entries[i] ? 0 : s.notes[i];
    }
    this.history.length = 0;
    if (Array.isArray(s.history)) {
      const ok = s.history.every(
        (op) =>
          Array.isArray(op) &&
          typeof op[0] === 'string' &&
          Array.isArray(op[1]) &&
          op[1].length % 3 === 0 &&
          op[1].every((v, k) => (k % 3 === 0 ? okInt(v, total - 1) && !this.given[v] : k % 3 === 1 ? okInt(v, N) : okInt(v, maxMask)))
      );
      if (ok) for (const op of s.history) this.history.push({ k: op[0], c: op[1].slice() });
    }
    this.completed = [];
    return true;
  }

  // ---- internals --------------------------------------------------------------

  _editable(i) {
    return Number.isInteger(i) && i >= 0 && i < this.total && !this.given[i];
  }

  /** Set a cell, recording its previous state into rec. */
  _write(i, e, n, rec) {
    if (this.entries[i] === e && this.notes[i] === n) return;
    rec.push(i, this.entries[i], this.notes[i]);
    this.entries[i] = e;
    this.notes[i] = n;
  }

  _sweepPeers(i, d, rec) {
    const bit = 1 << d;
    for (const p of this.peers[i]) {
      if (this.notes[p] & bit) this._write(p, this.entries[p], this.notes[p] & ~bit, rec);
    }
  }

  /** Push the op and work out which units the placed cells just completed
   *  correctly. Only a unit containing a newly placed cell can have become
   *  complete, so only those are checked. */
  _commit(kind, rec, placedCells) {
    this.history.push({ k: kind, c: rec });
    const done = [];
    for (const i of placedCells) {
      if (this.entries[i] !== this.solution[i]) continue;
      for (const u of this.cellUnits[i]) {
        if (done.includes(u)) continue;
        if (u.cells.every((c) => this.entries[c] === this.solution[c])) done.push(u);
      }
    }
    this.completed = done;
    const cells = [];
    for (let k = 0; k < rec.length; k += 3) if (!cells.includes(rec[k])) cells.push(rec[k]);
    return { kind, cells, completed: done };
  }
}
