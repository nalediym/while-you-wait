# while-you-wait

A tiny Game Boy–style arcade that lives in a side pane of Claude Code, and is
**only playable while Claude is working**. Play a quick game while Claude runs a
long task, and leave your phone alone.

<p>
  <img src="docs/2048.svg" width="230" alt="The handheld playing 2048">
  <img src="docs/mines.svg" width="230" alt="The handheld playing Minesweeper">
  <img src="docs/crossword.svg" width="230" alt="The handheld playing a mini crossword">
  <img src="docs/resting.svg" width="230" alt="The handheld locked: Claude's resting, with today's stats">
</p>

These images are drawn by the plugin's own code (`hooks/ui/device.ts`). It's a
real 160×144 LCD in the four DMG greens, with a hand-made 5×7 pixel font.

## How it works

- **`/games`** opens the pane at any time.
- When a turn has been running for **60 seconds**, the pane opens beside the
  transcript once. It never takes keyboard focus, so it can't interrupt your typing.
- **You can only play while Claude is working.** When Claude is idle, the pane
  locks and shows *"Claude's resting — go ship something"* along with your stats.
- When Claude **finishes**, or **needs you** (a permission prompt or a question),
  the game pauses and saves its exact state. A banner in the pane says
  *Claude's done* or *Claude needs you*, with a **↩ Back to Claude** button.
  v1 has no toasts, sounds or OS notifications.
- Your game resumes exactly where you left it, including in later sessions.

### Games

| Game | Controls |
| --- | --- |
| **2048** | Arrow keys / WASD, or click the drawn D-pad. START deals a new board. |
| **Minesweeper**: 9×9 with 10 mines, and your first dig is always safe | Click a square to dig, right-click to flag. Click **FLAG** at the top to make clicks plant flags. With the keyboard: arrows to move, Enter/Z to dig, X/F to flag. |
| **Mini crossword**: 30 original 5×5 puzzles | Click a square and type. Enter switches across/down, Backspace erases. All the clues are listed under the handheld. Puzzles you've solved are tracked. |

Everything on the handheld can be clicked: the screen, D-pad, A, B, SELECT
(back to the menu) and START (new game). Click it once and it also takes your
keyboard; Esc returns you to the prompt.

### Stats that make you feel productive, not addicted

Your work stats come first and are the biggest thing on the stats screen:
tasks Claude completed, how long Claude worked, tool calls, files edited, and
how many of those tasks finished while you waited, shown for today and all
time. For example: *"Claude shipped 14 tasks while you cleared 6 boards."*
Game bests (2048 tile and score, fastest Minesweeper clears, crosswords solved)
come after, in a quieter style. There are no streaks, no "one more game"
nudges, and nothing to play while Claude is idle.

## Install

From a Claude Code terminal session:

```
/plugin install while-you-wait --marketplace nalediym/while-you-wait
```

Answer `y` to add the marketplace, then pick a scope (user is the first option).

**Claude desktop app:** click **+ → Plugins → Add marketplace**, enter
`nalediym/while-you-wait`, then install **while-you-wait**.

v1 draws for the **desktop app** (`desktop` surface). Terminal support is on the roadmap.

## Development

The plugin is a Claude Code function-hooks mod: `hooks/register.tsx` connects
engine events to a pure model.

```
.claude-plugin/plugin.json      manifest (+ marketplace.json)
hooks/register.tsx              event wiring: turns, tools, attention, /games, the pane
hooks/model.ts                  pure model: save data, stats, one input -> next state
hooks/games/                    pure game logic (2048, minesweeper, crossword, rng)
hooks/games/puzzles.ts          GENERATED from data/crosswords.json
hooks/ui/device.ts              the handheld as one SVG (pure: state in, svg + hit map out)
hooks/ui/pixelfont.ts           the 5x7 / 3x5 pixel fonts
hooks/ui/pad.tsx, hit.ts        the invisible input layer over the drawing
hooks/ui/pane*.tsx              the pane (handheld + text); a plain fallback for surfaces without Svg
types/index.d.ts                every $.state value the mod keeps
tests/                          unit tests + a desktop pane test of the whole loop
scripts/                        dev tools (below)
```

Rendering stays in `hooks/ui/`. `device.ts` turns state into an SVG plus a hit
map, and `pane-cells.tsx` is a plain Box drawing for surfaces without `Svg`.
That plain drawing is where a terminal surface would start.

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

```bash
./scripts/typecheck.sh
```

```bash
claude --plugin-dir .
```

Dev tools in `scripts/`:

- `typecheck.sh`: copies this machine's `claude-code.d.ts` into place and runs `tsc`.
- `preview/devices.ts`: renders the handheld for every screen into one page, straight
  from the drawing code (`bun scripts/preview/devices.ts .preview/index.html`).
  The SVG draws the same in a browser as in the app.
- `preview.ts`: drives the whole pane through the engine and renders an HTML
  contact sheet (`bun scripts/preview.ts --out .preview/pane.html`).
- `preview/readme-shots.ts`: regenerates the images in `docs/`.
- `gen-crossword.ts`: a backtracking 5×5 grid filler over `wordlist.txt`.
- `check-crosswords.ts`: validates every puzzle (numbering, checked cells,
  answers in the word list, clue coverage).
- `build-puzzles.ts`: regenerates `hooks/games/puzzles.ts` from
  `data/crosswords.json` (`--check` reports when the generated file is stale).

## Roadmap (v2)

- Claude-generated crosswords for when you run out of bundled ones
- Terminal surface support
- More games: Connect Four against the computer, match-3, a snake/food-hunt game
- Optional sound and OS notification settings

## License

MIT. The crossword grids and clues are original to this project.
