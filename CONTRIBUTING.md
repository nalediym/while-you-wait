# Contributing

Thanks for wanting to help. You're welcome to send new games, more crosswords,
terminal support, bug fixes and clearer words. For anything bigger than a small
fix, open an issue first so we can agree on the shape.

## Setup

You need:

- **Claude Code 2.1.295 or newer.** while-you-wait is a function-hooks plugin.
- **The Claude desktop app** to see the pane. Other surfaces get a plain fallback drawing.
- **[Bun](https://bun.sh)** for the scripts.

```bash
git clone https://github.com/nalediym/while-you-wait && cd while-you-wait
```

### Run your copy

There are two ways to load your folder:

- **Desktop app.** Add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env`
  block of `~/.claude/settings.json`. New sessions load it from there.
  Interactive sessions watch it, so saving a file reloads the plugin.
- **Terminal.** Run `claude --plugin-dir .`. The hooks run, but only the
  desktop app draws the pane.

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/absolute/path/to/while-you-wait" } }
```

If you also installed while-you-wait from the marketplace, disable that copy
while you work, so the plugin you're testing is the one in your folder.

**`/games test`** makes the arcade playable at any time in that session, so
you don't have to keep Claude busy to try a change.

### Developer tools

The `devTools` option is off for players. Turn it on in `settings.json`:

```json
{ "pluginConfigs": { "while-you-wait": { "options": { "devTools": true } } } }
```

In a terminal session, you can also use the plugin's **Developer tools** row
in `/config`. With the option on, you get:

- **An event timeline.** It's stored under the key `debug-timeline` and holds
  the last 80 events with the state after each one: turns, agents, workflows,
  test mode, keyboard focus.
- **A `debug` tool that Claude can call.** Ask Claude to *"call the
  while-you-wait debug tool"* and it can:
  - read the live state, the save and the timeline (`status`)
  - turn test mode on or off (`test_on`, `test_off`)
  - show or clear a banner (`banner_done`, `banner_needs_you`, `banner_clear`)

  This lets Claude check its own work against the real engine, for example by
  starting fake background agents and watching the count go 2 → 1 → 0.

## Checks

```bash
./scripts/check.sh
```

This runs every check a change has to pass:

- The version in `plugin.json` and `BUILD` agree.
- `claude plugin validate` passes.
- The tests pass.
- Every crossword is valid, and `puzzles.ts` is up to date.
- `tsc` is clean.

CI runs the same script on every push and pull request, without `tsc`. The
plugin API's types are only written on a machine where Claude Code's
`plugin-authoring` skill has loaded, so run `./scripts/typecheck.sh` locally.
It finds those types for you, or you can set `CLAUDE_CODE_DTS` to point at them.

## How it fits together

```
engine events ─▶ hooks/register.tsx ─▶ hooks/model.ts (pure) ─▶ $.state / $.store
                                                                     │
         pane buttons ◀─ hooks/ui/pane.tsx ◀─ hooks/ui/device.ts (SVG) ◀┘
```

```
.claude-plugin/plugin.json      manifest: version, the devTools option (+ marketplace.json)
hooks/register.tsx              event wiring: turns, agents, attention, /games, the pane, devTools
hooks/model.ts                  pure model: the save, session stats, one input -> next state
hooks/games/                    pure game logic: 2048, minesweeper, crossword, a seeded rng
hooks/games/puzzles.ts          GENERATED from data/crosswords.json (don't edit)
hooks/ui/device.ts              the handheld as one SVG: state in, svg out
hooks/ui/pixelfont.ts           the 5x7 and 3x5 pixel fonts
hooks/ui/pane.tsx               the desktop pane: the SVG, the real buttons, keyboard mode
hooks/ui/pane-cells.tsx         the plain Box drawing every other surface gets (grid.ts, draw-grid.tsx)
hooks/ui/keys.ts                keys -> inputs, and what the keyboard-mode field's text means
types/index.d.ts                the $.state contract: every value the plugin keeps
tests/                          game, model and pane tests; harness.ts stands in for the engine
scripts/                        checks, previews, crossword tools
```

A few rules keep it working:

- **Keep the model and the games pure.** Nothing in `hooks/model.ts` or
  `hooks/games/` touches `$`. That's why all of it can be unit-tested.
- **Every change goes through `mutate` or `transact`** in `register.tsx`.
  Hooks run concurrently: a turn can start while an agent finishes. Both
  functions run one change at a time from the latest values. `$.store` is the
  source of truth for the save, so one session never writes a stale game over
  one played in another.
- **`types/index.d.ts` must be self-contained, with no imports.** The engine
  reads it on its own.

These are facts about the desktop app, all checked live:

- A pane gets no clicks or keys on a drawing.
- `Button`s click fine, but their hotkeys never arrive.
- Only an `Input` receives typing. That's why keyboard mode is a text field.
- `$.ui.focus` reports success, but focus doesn't move, so the field asks to be
  clicked.

Don't build input on `Client` pointer events: that layer was removed in 0.3.7.
Use real `Button`s.

## Adding a game

Work through these in order. `tsc` flags most of the places you'd miss,
because the screen switches are exhaustive.

1. **The logic.** Write `hooks/games/<game>.ts` as pure functions over a plain
   state object. Declare its type in `types/index.d.ts`.
2. **The save.** Add a field to `Save` (types) and to `freshSave` and
   `loadSave` in `model.ts`. `loadSave` must accept saves from older versions,
   so the new field defaults to `null`.
3. **The screen.** Add it to the `Screen` union, `GameId`, `GAMES` and `MENU`.
   Start it in `openScreen` and handle its inputs (`dir`, `a`, `b`, `start`,
   `select`) in `act`. If it can be finished or has a best, also update
   `boardsFinished` and `recordCleared`.
4. **The drawing.** Write an LCD screen function in `device.ts`:
   - 160×144 LCD units
   - only the four greens in `palette.ts`
   - text through the `Typesetter`

   Hook it into `screenFor`. Describe it in `svgAlt`: screen readers and the
   tests both read that text.
5. **The controls.** In `pane.tsx`, add its hint to `HINTS`, its keys to
   `KEY_HELP`, and A/B labels if they mean something special. In `keys.ts`,
   add any keys it needs.
6. **The fallback.** Add a grid in `grid.ts` and a case in `pane-cells.tsx`.
7. **The tests.** Write `tests/<game>.test.ts` for the logic. Add a pane test
   in `tests/pane.test.tsx` that plays it by pressing the real buttons.
8. **The docs.** Add a screen to `scripts/preview/devices.ts` and a row to
   the README's games table. If it belongs in the README images, regenerate
   them with `bun scripts/preview/readme-shots.ts`.

## Crosswords

The puzzles live in `data/crosswords.json`, and every clue is original. Keep
it that way: don't copy clues from published puzzles.

```bash
bun scripts/gen-crossword.ts --list
```

```bash
bun scripts/gen-crossword.ts --pattern corners2 --seed 7 --count 5
```

```bash
bun scripts/check-crosswords.ts
```

```bash
bun scripts/build-puzzles.ts
```

- `gen-crossword.ts` fills a 5×5 grid from `scripts/wordlist.txt`. Run it with
  `--list` to see the block patterns, and see its header for more options.
- Write the clues yourself and add the puzzle to `data/crosswords.json`.
- `check-crosswords.ts` checks numbering, checked cells, that answers are in
  the word list, and clue coverage.
- `build-puzzles.ts` regenerates `hooks/games/puzzles.ts`.

## Seeing it without the app

```bash
bun scripts/preview/devices.ts .preview/index.html
```

```bash
bun scripts/preview.ts --out .preview/pane.html
```

- `devices.ts` draws the handheld for every screen, straight from the drawing
  code. An SVG draws the same in a browser as in the app.
- `preview.ts` drives the whole pane through the engine and renders a contact
  sheet, with the SVG, the buttons and the text below.

In the Claude desktop app, `.claude/launch.json` has a `preview` server that
serves `.preview/` on port 4517. `bun scripts/preview/readme-shots.ts`
regenerates the handheld images in `docs/`.

## Pull requests

- Run `./scripts/check.sh`.
- For a UI change, add before and after screenshots from the previews.
- Use conventional commits, saying why: `fix(agents): count workflows, since agent.list() leaves them out`.

## Releasing (maintainers)

1. Bump `version` in `.claude-plugin/plugin.json` and `BUILD` in
   `hooks/register.tsx`. Installed copies only update when the version changes.
2. Add a `CHANGELOG.md` entry.
3. Run `./scripts/check.sh`, then commit and push to `main`.
4. Update your own install:

```bash
claude plugin marketplace update while-you-wait
```

```bash
claude plugin update while-you-wait@while-you-wait
```
