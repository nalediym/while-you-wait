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
- When Claude has been busy for **60 seconds**, the pane opens beside the
  transcript once. It never takes keyboard focus, so it can't interrupt your typing.
- **Background agents count as Claude working.** If your turn ends while
  background agents or a workflow in the session are still running, the arcade
  stays unlocked and the screen shows how many are working (✦2; a workflow counts
  as one). *Claude's done* appears only when the last one finishes.
- **You can only play while Claude is working.** When Claude is idle, the pane
  locks and shows *"Claude's resting — go ship something"* along with your stats.
- When Claude **finishes**, or **needs you** (a permission prompt or a question),
  the game pauses and saves its exact state. A banner in the pane says
  *Claude's done* or *Claude needs you*, with a **↩ Back to Claude** button.
  v1 has no toasts, sounds or OS notifications.
- Your game resumes exactly where you left it, in this session or any other.

### Games

| Game | Controls |
| --- | --- |
| **2048** | The D-pad slides the tiles (W A S D in keyboard mode). START deals a new board. |
| **Minesweeper**: 9×9 with 10 mines, and your first dig is always safe | The D-pad moves, A digs, B flags. **FLAG** makes A plant flags. In keyboard mode: W A S D, Z digs, X flags. |
| **Mini crossword**: 30 original 5×5 puzzles | Turn on keyboard mode and type. A or Enter switches across/down, B or Backspace erases. All the clues are listed under the handheld. Puzzles you've solved are tracked. |

The buttons under the screen are real buttons: the D-pad, B, A, SELECT (back to
the menu) and START (new game). **⌨ Use keyboard** turns on keyboard mode, so
W A S D, Z (= A), X (= B) and N (new game) play the game. The desktop app only
sends a plugin's keys into a text field, so keyboard mode is a small field
that's focused for you. Arrow keys can't work there.

**`/games test`** turns on test mode: the arcade is playable anytime in that
session, whatever Claude is doing. Run it again to turn it off.

### Stats that make you feel productive, not addicted

Your work stats come first and are the biggest thing on the stats screen:
tasks Claude completed, how long Claude worked, tool calls, files edited, and
how many of those tasks finished while you waited. For example: *"Claude
shipped 14 tasks while you cleared 6 boards."*

**Stats count the current session only.** They start at zero in every new
session and are never written to disk. Your games in progress and your bests
(2048 tile and score, fastest Minesweeper clears, crosswords solved) do carry
over, so you can pick up a game in any session. If several sessions are open,
they share those games safely, and one session can't overwrite progress you
made in another. There are no streaks, no "one more game" nudges, and nothing
to play while Claude is idle.

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
