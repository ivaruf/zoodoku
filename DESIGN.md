# Zoodoku — design and build contract

Sudoku, starting with a fox. The smallest boards are 4×4 and you drag little
animals into them instead of digits; the trail climbs through 6×6 to classic
9×9 with numbers. Every puzzle is generated in the browser from a seed, so
level 23 is the same level 23 on every device, and free roam never runs out.

Part of the games hub — `../CLAUDE.md` governs (free, no dark patterns, no
tracking, ES modules, ship what you wrote, sw.js release rules, the six menu
duties). This file is the multi-agent contract: who owns which file, and the
interfaces between them. **When two lanes disagree, ratify the answer here
rather than just fixing the code.**

Audience: roughly 7–12. Kid-friendly but not the five-year-old toy boxes
(`playroom`, `think`, `letters`): no narrator, no "Great job!!" on every tap,
no lock-and-key progression. It should feel like a good board game a ten-year-
old is proud to be good at, with numbers as a *promotion*, not a punishment.

---

## 1. Rules of play (decided — from the research memos)

- **Any placement is allowed.** No mistake counter, no limit, no game over.
  Unlimited undo. A board is only *solved* when every cell matches the
  solution.
- **Rule conflicts are shown by default** (setting, on): the same symbol twice
  in a visible row/column/box marks *both* cells — red outline and a short
  wiggle on placement. It is honest: the reason is on the board.
- **Solution checking is opt-in and on demand**: the toolbar's *Check* button
  marks wrong entries once (they fade after a few seconds). Never an always-on
  oracle; that trains guessing.
- **Hints: one button, three tiers, unlimited, uncounted, never shamed.**
  1. *Nudge* — the unit glows: "Look at this row."
  2. *Reason* — causes highlighted, words: "This row already has a fox, a frog
     and a whale…" / "The 7 has only one place to go in this box."
  3. *Show me* — place it.
  Dismissable at any tier. If the player has a wrong entry, the hint says so
  first ("Something here doesn't fit" → which cell), because logic built on a
  wrong entry gives nonsense. Hints are computed from the board, not notes.
- **Input is hybrid with no mode switch**:
  - *Drag* a tray tile onto a cell (token lifted and enlarged ~1.3× above the
    finger by ~0.6 cell, drop point = finger, snaps to nearest cell within half
    a cell, a miss flies back to the tray, no penalty). Drag a placed entry off
    the board to clear it, or onto another cell to move it.
  - *Cell first*: tap a cell, then a tray tile.
  - *Tile first*: tap a tray tile (it stays picked, glowing), then tap cells to
    stamp it. Tap the picked tile again to drop it.
  - Whichever is touched first decides. Keyboard: arrows move the cursor,
    1–N place, Backspace/Delete/0 clear, N toggles notes, H hint, Z/Ctrl+Z
    undo, Escape opens the menu (and closes it again; elsewhere it is one
    step back, and on the title it is Back to arcade — hub §2).
- **Notes (pencil marks)** appear from the first trail level that can need them
  (6×6 tier 3 and all 9×9; free roam same rule). A notes toggle in the toolbar;
  in notes mode a drop/tap toggles a small mark. Placing an entry auto-removes
  that symbol's notes from its peers (setting, on). No auto-fill in v1.
- **Highlights**: selected cell's row, column and box softly shaded; every copy
  of the selected/picked symbol shaded; tray tiles show a remaining-count badge
  and settle (dim, tick) when all N are placed.
- **Celebration**: a row/column/box that completes *correctly* does a small
  ripple — its animals hop (numbers pop). Solving the board: every tile hops in
  a wave, then the win card. No scores, no timer.
- **Tutorial**: three tiny 4×4 boards on first launch (skippable, replayable
  from the title): rows only → columns → boxes, one rule per board, learned by
  doing. A one-line coach note on first 6×6 ("boxes are 2 tall, 3 wide") and
  first 9×9 ("numbers now — and notes").

## 2. Content

### Symbols
Nine animals, in order (digit 1 = fox … 9 = crab). Each has a distinct colour
**and** silhouette, so colour-blind players can tell them apart:

| d | animal  | colour  |
|---|---------|---------|
| 1 | fox     | #f28c38 |
| 2 | frog    | #5cbf60 |
| 3 | whale   | #4a90d9 |
| 4 | lion    | #f2c230 |
| 5 | pig     | #f29bb5 |
| 6 | owl     | #9b6fd1 |
| 7 | bear    | #9a6a44 |
| 8 | penguin | #2b2f3a |
| 9 | crab    | #e0503c |

A board uses symbols 1..N. **Skin** (`'animals' | 'numbers'`) is pure
rendering; the engine only knows digits. Each trail level has a default skin;
the menu can flip the current board's skin, and free roam lets you choose.

### The trail (levels.js — engine lane)
60 levels following the generator memo's curve (tier = max human technique):

| Levels | Size | Skin    | Max tier / required | Clues  | minAvail | Sym  |
|--------|------|---------|---------------------|--------|----------|------|
| 1–5    | 4    | animals | T0 / –              | 10–12  | ≥3       | none |
| 6–10   | 4    | animals | T1 / –              | 7–9    | ≥2       | none |
| 11–14  | 4    | animals | T2 / –              | 5–6    | ≥1       | none |
| 15–20  | 6    | animals | T0 / –              | 20–24  | ≥4       | none |
| 21–26  | 6    | animals | T1 / –              | 15–18  | ≥2       | none |
| 27–30  | 6    | numbers | T2 / –              | 12–14  | ≥1       | none |
| 31–34  | 6    | numbers | T3 / T3 (best effort)| 9–12  | ≥1       | none |
| 35–38  | 9    | numbers | T0 / –              | 45–50  | ≥5       | 180° |
| 39–42  | 9    | numbers | T1 / –              | 36–42  | ≥3       | 180° |
| 43–46  | 9    | numbers | T2 / –              | 30–35  | ≥2       | 180° |
| 47–50  | 9    | numbers | T3 / T3             | 26–31  | ≥1       | 180° |
| 51–54  | 9    | numbers | T4 / T4             | 24–28  | –        | 180° |
| 55–57  | 9    | numbers | T5 / T5             | 22–27  | –        | 180° |
| 58–60  | 9    | numbers | T6 / T6             | 22–26  | –        | 180° |

Tiers: T0 full house + hidden single in box · T1 hidden single any unit ·
T2 + naked single · T3 + pointing/claiming · T4 + naked/hidden pairs ·
T5 + triples, X-wing · T6 + swordfish, XY-wing.

The trail is a **path, not a gate**: every level is open, the next unsolved
one is highlighted ("a little harder"), solved ones get a tick. Measure the
clue ranges and budgets in the first implementation and adjust this table.

### Free roam
Pick a board — **Pond 4×4**, **Meadow 6×6**, **Savanna 9×9** — a skin, and
paws for difficulty (4×4: 1–3 paws = T0–T2; 6×6: 1–4 = T0–T3; 9×9: 1–7 =
T0–T6). Each "New puzzle" is seed `zoodoku-v1-free-<size>-<tier>-<n>` with n
counted up in storage, so free roam is reproducible too.

### Words
Two languages, bokmål first (hub §2): every word is in `js/i18n.js`, the
choice is the hub's `arcade.lang.v1`, and the **Språk / Language** row lives in
the menu panel — the pause in play, the settings anywhere else, so it is
reachable from the title before a run. Switching is live.

Menus speak the hub glossary, plainly (2026-10-10, replacing "▶ Follow the
trail", "Trail map", "Free roam", "Back to the puzzle", "Clash marks"):
title doors **"▶ Spill / ▶ Play"** (continues at the next unsolved level; "▶
Fortsett / ▶ Resume" when a board is saved), **"Nivåer / Levels"**, **"Fritt
spill / Free play"**, *"Slik spiller du / How to play"*. Free play names its
boards by size (Lite / Middels / Stort); Pond, Meadow and Savanna (Dammen,
Engen, Savannen) stay on the trail map and in the play label, where they are
flavour. The way out is "Tilbake til arkaden / Back to arcade"; panel back
buttons say "Tilbake / Back". The zoo's voice lives in hints, the egg and the
win card.

## 3. Look

Warm, chunky, tactile — a wooden-and-paper board game on a meadow, not a
spreadsheet. System fonts only (`ui-rounded, "SF Pro Rounded", system-ui, …`),
no web fonts. Rounded tiles with a soft bottom shadow like a real game piece.
Shared tokens (declared on `:root` in `css/style.css`; `css/board.css` only
*uses* them):

```
--bg: #1f5f5b;   --bg-deep: #174845;   --board: #fff6e3;  --cell: #fffaf0;
--ink: #2e4a48;  --ink-soft: #6c8583;  --sun: #ffc94a;    --coral: #ff7a59;
--leaf: #8fd18a; --bad: #e0503c;       --given: #efe4cc;  --shade: #f6ebd2;
--radius: 14px;  --font: ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif;
```

Givens sit on a slightly darker, flatter tile (`--given`) and can't be moved;
player entries are raised tiles. Box borders are thick ink, cell lines thin.

## 4. Files and owners

One file, one owner. Do not edit another lane's file; if you need a change,
note it in your report and the integrator (the orchestrating session) does it.

| Lane | Owner | Files |
|---|---|---|
| **A — Engine** | engine agent | `js/rng.js`, `js/grid.js`, `js/solver.js`, `js/techniques.js`, `js/grader.js`, `js/generator.js`, `js/levels.js`, `js/hints.js`, `js/engine.js`, `js/gen-worker.js`, `tests/engine.test.mjs`, `tools/bench.mjs` |
| **B — Play surface** | play agent | `js/game.js`, `js/play.js`, `js/board.js`, `js/input.js`, `css/board.css` |
| **C — Shell & menus** | shell agent | `index.html`, `css/style.css`, `js/main.js`, `js/ui.js`, `js/store.js`, `js/screen.js`, `js/update.js`, `js/touch-guard.js`, `js/intro.js`, `sw.js`, `manifest.webmanifest`, `README.md` |
| **D — Art** | art agent | `js/animals.js`, `tools/make-icons.py`, `icons/*` |

Integrator owns `DESIGN.md` and the final wiring pass.

## 5. Interfaces

All modules are ES modules with relative `.js` imports. Cell index is
`r*N + c`. Digits are `1..N`; `0` is empty. Grids are plain arrays of length
N*N (or Int8Array — consumers must only index them).

### Engine (A)

```js
// js/levels.js
export const LEVEL_COUNT = 60;
export function levelInfo(level) // 1-based → { level, size, skin, tier, band }
export const TUTORIAL /* [{ size:4, givens, solution, rule:'rows'|'cols'|'boxes', coach }] x3, hand-built */
export const FREE_TIERS /* { 4: 3, 6: 4, 9: 7 } — number of paw levels */

// js/engine.js — the only engine entry point the UI uses
export function getPuzzle(spec) // Promise<Puzzle>
//   spec = { kind:'trail', level } | { kind:'free', size, tier, n }
//   9×9 runs in a module Worker (js/gen-worker.js); falls back to main thread
//   if Worker construction fails. Deterministic for a given spec.
// Puzzle = { id: string /* the seed string */, size, box:{h,w}, givens:number[],
//            solution:number[], tier, notes:boolean /* notes offered */ }
export function geometry(size) // { N, bh, bw, rowOf, colOf, boxOf, units, peers }
//   units: array of { type:'row'|'col'|'box', index, cells:number[] }

// js/hints.js
export function nextHint(puzzle, entries /* number[] incl. givens */) // Hint | null
// Hint =
//  { kind:'wrong', cells:number[] }                       // wrong entries exist
//  { kind:'step', technique, tier, unit:{type,index,cells}, placements:[{cell,digit}],
//    eliminations:[{cell,digit}], focusCells, patternCells, causeCells, digits,
//    text:{ key, args } }
// text keys (UI turns them into words): 'full_house', 'hidden_single_box',
// 'hidden_single_line', 'naked_single', 'pointing', 'claiming', 'naked_pair',
// 'hidden_pair', 'naked_triple', 'hidden_triple', 'x_wing', 'swordfish', 'xy_wing'.
// For pair/elimination steps with no placement, tier 3 "show me" applies the
// eliminations as notes (or, if notes are off, falls back to the next
// placement the solution implies — the play lane decides; document it).
```

### Art (D)

```js
// js/animals.js
export const ANIMALS // [{ d:1, id:'fox', name:'fox', color:'#f28c38' }, …] x9
export function symbolMarkup(d, skin) // string: an inline <svg> for d in skin
//   'animals' → the animal on transparent ground, viewBox 0 0 100 100,
//   class="zd-sym zd-a-<id>" with sub-groups classed so CSS can animate
//   (e.g. .zd-ears, .zd-eyes for a blink).
//   'numbers' → the numeral as chunky drawn paths (not a font), ink-coloured.
export function symbolName(d, skin, { plural=false } = {}) // 'fox' | 'foxes' | '7'
```

### Play surface (B)

```js
// js/play.js
export function mountPlay(container, opts) // → PlayHandle
// opts = { puzzle, saved /* from handle.serialize() or null */, skin,
//          settings /* { conflicts:true, autoNotes:true } */,
//          emphasis /* tutorial: 'rows'|'cols'|'boxes'|null */, coach /* string|null */,
//          onChange(state) /* call after every move — the shell saves it */,
//          onSolved() /* after the solve wave finishes */,
//          sfx(name) /* optional; names: place, clear, wiggle, unit, solve, hint, pick */ }
// PlayHandle = { setSkin(skin), setSettings(s), restart(), undo(), serialize(),
//                pause(), resume(), destroy() }
```

`mountPlay` builds the board, the tray and the toolbar (Undo, Erase, Notes —
only if `puzzle.notes` —, Hint, Check). It owns all pointer/keyboard input
**on the play surface**; Escape is left to the shell. Board cells are real
`<button>`s in a `role="grid"` with `aria-label`s ("Row 2, column 3: fox" /
"empty"), so it is accessible and keyboard-focusable. The board is sized to
the largest square that fits the container beside/above the tray (tray to the
side in landscape, below in portrait). `touch-action: none` on the play
surface. No per-frame allocation; animations are CSS.

### Shell (C)

Screens: title → trail map / free roam picker / tutorial → play → win card.
Owns the corner (menu plate in play; sound + fullscreen), the pause menu
(Resume, Show as animals/numbers, Conflict marks on/off, Restart puzzle,
Back to the trail, sound rows, Back to arcade), the sound panel, the update
button, the crash bar, storage, and the service worker.

Storage (`js/store.js`, all try/catch, non-finite rejected):

| key | holds |
|---|---|
| `zoodoku.progress.v1` | `{ solved: { [level]: true }, tutorialDone, freeN: { "<size>-<tier>": n } }` |
| `zoodoku.run.v1` | the board in progress: `{ spec, puzzle, skin, play: handle.serialize() }` — the whole puzzle is stored so a deploy that changes the generator never swaps a puzzle under a running game (hub §1) |
| `zoodoku.settings.v1` | `{ conflicts, autoNotes }` |
| `zoodoku.vol.music.v1` / `zoodoku.vol.sfx.v1` | 0–1 |

**Sound in v1: none.** The panel exists (hub rule: a silent game still gets
it) with MUSIC and EFFECTS rows that persist, and a hint line saying plainly
the zoo is quiet for now. `opts.sfx` is the hook for later: cues will be
Sonic Pi pieces in `tools/audio/` per hub §9. Do not build an audio engine.

## 6. Hub conventions — what to copy from where

No single reference game does everything right. Take each piece from the
named file, and read its comments — they carry the pitfalls.

- **Service worker** — `lobbots/sw.js` shape: `VERSION` + one-line note,
  `CACHE = \`zoodoku-${VERSION}\``, explicit `ASSETS` list of *every* shipped
  file (a missing one vanishes offline; a listed-but-absent one fails the whole
  install), install without `skipWaiting`, `SKIP_WAITING` + `GET_VERSION`
  (MessageChannel) messages, activate deletes only keys that
  `startsWith('zoodoku-')` and `!== CACHE`, cache-first fetch, navigation
  falls back to `./index.html`.
- **Update button** — `lobbots/js/update.js` (self-contained module, loaded
  before main.js) **plus** maxgear's 3 s reload fallback after SKIP_WAITING
  (`maxgear/js/main.js:387-403`). The button lives on the title screen only,
  so an update can never interrupt a board. A first install (no controller)
  is not an update. Show `Build vX` from GET_VERSION.
- **Manifest / icons** — `lobbots/manifest.webmanifest` fields;
  `name: "Zoodoku — Sudoku, starting with a fox."`; 192, 512, 512-maskable in
  the manifest, 180 as `apple-touch-icon`. `lobbots/tools/make-icons.py` shape
  (Pillow only, 4× then LANCZOS, maskable background drawn full-frame).
- **Corner** — markup from `neonfox/index.html:283-363` (`#corner-tools`:
  menu, mute, fullscreen, exact hub path data), CSS from
  `neonfox/css/style.css:503-590`, and write `.icon-button[hidden]{display:none}`
  explicitly. **Placement: on every screen** — Zoodoku has no HUD that wants
  the corner, so fullscreen stays reachable mid-puzzle; the play layout
  reserves the top-right. Say so in a comment. The speaker plate is a live
  mute toggle (as in neonfox and maxgear); the MUSIC/EFFECTS sliders live in
  the menu panel. Corner clicks `stopPropagation`.
- **Fullscreen** — `lobbots/js/screen.js` (self-contained, never named
  `fullscreen.js`), hidden until request+exit exist, repaint on
  `fullscreenchange`/`webkitfullscreenchange`, swallow rejections. Drop the
  landscape lock — a sudoku board is square.
- **Sound rows** — markup `neonfox/index.html:422-450`, styled range
  `neonfox/css/style.css:248-315`. Keys `zoodoku.vol.music.v1` /
  `zoodoku.vol.sfx.v1` plus `zoodoku.muted.v1`; **reject non-finite with
  `Number.isFinite`** (neonfox/lobbots/maxgear all miss this). Dragging a row
  lifts the mute. With no audio yet, the hint line says the zoo is quiet.
- **Touch guard** — copy `lobbots/js/touch-guard.js` verbatim (classic,
  `defer`, precached) and the CSS block at `lobbots/css/style.css:84-120`;
  the play surface gets `touch-action: none`.
- **Arcade exit** — `<script src="../arcade/exit.js" defer data-handled="optional">`;
  wire as `neonfox/js/ui.js:255-292`: show only if
  `exit.framed() || exit.standalone()` (not `offers()`), label from
  `exit.verb({ arcade: "Back to arcade", app: "Close" })`, handle `'refused'`.
  Retry the wiring on `load` and after 1500 ms (`lobbots/js/main.js:950-963`).
  Last on the title and on the pause face of the menu (never its settings
  face), a ghost with the hub's back arrow, sentence case.
- **Crash bar** — `lobbots/index.html:537-582` (capture-phase `error`, skip
  `data-handled`, name the entry point and say the culprit may be an import),
  CSS `lobbots/css/style.css:1448-1460`.
- **Pause** — single player, so the menu plate pauses: maxgear's
  `menuReturn` pattern (`maxgear/js/main.js:170-185`), panel says "Paused"
  in play and acts as settings elsewhere; focus moves into the panel.
- **Landscape phone** — `@media (orientation: landscape) and (max-height: 500px)`
  per `maxgear/css/style.css:1413-1520` and `neonfox/css/style.css:960-1030`:
  two-column grids by area over unchanged markup, controls ≥ 38px, an
  `overflow:auto` safety net. The play screen: board left (full height), tray
  and toolbar right.
- **Head** — `lobbots/index.html:1-54` (viewport-fit=cover, theme-color
  `#1f5f5b`, manifest, apple-touch-icon, exit.js, touch-guard.js); body end:
  crash bar, then modules `js/update.js`, `js/screen.js`, `js/main.js`.
- **Not needed**: `moved.js`, the wardrobe/outfit PoC, any incoming
  postMessage handling (the arcade sends the game nothing).
- **Never** a bare `top`/`parent`/`opener`/`frames` (hub §5). No filename
  from the hub blocklist (`fullscreen`, `popup`, `banner`, `ads`, `track`…).

## 7. Verification

Hub §11: `node --check` every file, grep sweep, no console errors, a manual
playtest checklist. The engine lane is the exception that earns a committed
test: `node --test tests/*.test.mjs` must pass (Node 22 does not expand a bare directory) (uniqueness, determinism, tier gating
for a sample of trail levels) and `node tools/bench.mjs` prints generation
times per band. Nobody starts a dev server.

## 8. Ratified after the first build (2026-10-10)

What the lanes found when the code met the plan. These override the sections
above where they disagree.

- **Trail clue ranges, 9×9.** T3 is 26–32 and T4–T6 are 24–32. A
  180°-symmetric board that cannot lose another clue lands at 24–32 clues
  whatever its tier, so the first table's narrower ranges missed on almost
  every attempt.
- **4×4 grades flat.** Every 4×4 is T0 (box singles always suffice), so
  levels 1–14 climb by fewer clues and a thinner `minAvail`, not by technique.
- **Honest misses.** `Puzzle.tier` is the *graded* tier; `bandTier` is what
  the level asked for, and `hit:false` says when a required tier was not
  reached within budget. Use `bandTier` for labels. `notes` follows the band,
  so it is the same for every puzzle of a level.
- **Free-roam `spec.tier` is 0-based** (paws − 1), and so is the seed.
- **Threading.** 9×9 and every required-tier band (incl. 6×6 levels 31–34) go
  to one long-lived module worker; any failure falls back to the main thread.
  T5 is the only slow band: ~1% of attempts hit, worst case ~0.85 s in Node,
  so 2–4 s on a phone behind the "hatching" egg.
- **Hint shape extras.** `unit.type` may be `'cell'` (naked single) or
  `'group'` (fish, XY-wing), with `index: -1`. Elimination-only steps carry
  `then: {cell, digit, technique}`, the placement they unlock; "Show me" removes
  the pencilled marks if there are any, otherwise places `then`.
- **Hint tiers are worded** "Tell me more" → "Show me", with "Got it" at
  every tier. A wrong entry goes "Something here doesn't fit." → "Which one?" →
  "Take it off" (one undoable clear).
- **Shell.** The title also has a *Trail map* door (otherwise the map is
  unreachable while a free-roam run is saved). The conflict setting reads
  "Clash marks". The free-roam picker is remembered for the session only — no
  storage key was invented for it.
- **`opts.coachFades`** (play): the first-6×6 / first-9×9 note is said once
  for eight seconds and goes; only a tutorial's `coach` stands for the whole
  board. Found on an iPad: the 9×9 note never went away.
