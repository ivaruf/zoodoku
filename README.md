# Zoodoku — Sudoku, starting with a fox.

Sudoku for roughly 7–12 year olds. The smallest boards are 4×4 and you drag
little animals into them instead of digits; a trail of sixty puzzles climbs
through the Pond (4×4) and the Meadow (6×6) to the Savanna, classic 9×9 with
numbers. Every puzzle is generated in the browser from a seed, so level 23 is
the same level 23 on every device, and free roam never runs out.

No timer, no scores, no mistake counter, no locks on the trail. Hints are
unlimited. Part of the games hub — `../CLAUDE.md` governs: free, no ads, no
tracking, everything stored on the device.

## Running it

There is no build step. From the hub root (`~/projects/games`):

```sh
python3 -m http.server
```

then open <http://localhost:8000/zoodoku/>. Serving from the hub root lets
`../arcade/exit.js` resolve; served on its own the game still runs, just
without a "Tilbake til arkaden" / "Back to arcade" button.

## Files

`DESIGN.md` is the contract: rules of play, the trail table, the look, and
which lane owns which file.

| Lane | Files |
|---|---|
| Shell & menus | `index.html`, `css/style.css`, `js/main.js`, `js/ui.js`, `js/i18n.js`, `js/store.js`, `js/screen.js`, `js/update.js`, `js/touch-guard.js`, `sw.js`, `manifest.webmanifest` |
| Play surface | `js/play.js`, `js/game.js`, `js/board.js`, `js/input.js`, `css/board.css` |
| Engine | `js/engine.js`, `js/gen-worker.js`, `js/levels.js`, `js/generator.js`, `js/solver.js`, `js/techniques.js`, `js/grader.js`, `js/hints.js`, `js/grid.js`, `js/rng.js`, `tests/`, `tools/bench.mjs` |
| Art | `js/animals.js`, `tools/make-icons.py`, `icons/` |

Plain ES modules with explicit `.js` imports, no dependencies, nothing
bundled or minified: what ships is what was written.

## Tests

The engine has a committed suite: `node --test tests/*.test.mjs` checks
uniqueness, seed determinism, tier gating and hints across the trail bands.
`node tools/bench.mjs` prints generation times per band. Nothing else is
automated; the rest is playtested by hand.

## Languages

Norsk (bokmål) by default, English one tap away: the Språk / Language row in
the menu panel, live, no reload. Every word is in `js/i18n.js`; `screen.js`,
`update.js` and the crash bar keep their own two-language tables because they
import nothing. The choice is the hub-wide `arcade.lang.v1`.

## Storage

All on the device, in `localStorage`, under `zoodoku.*` keys: trail progress,
the board in progress (stored whole, so an update never swaps a puzzle under a
running game), settings, and the two volume levels plus mute.

## Sound

None yet. The menu has MUSIC and EFFECTS sliders that remember their levels,
and says plainly that the zoo is quiet for now.

## Releasing

Bump `VERSION` in `sw.js` (with its one-line note) for every committed change
that deploys, and keep its `ASSETS` list in step with the shipped files. A new
build waits until the player taps the update button on the title screen.
