# while-you-wait

A tiny Game Boy–style arcade that lives in a side pane of Claude Code, and is
**only playable while Claude is working**. Play a quick game while Claude runs a
long task, and leave your phone alone.

```
◆ WHILE-YOU-WAIT          ● CLAUDE WORKING
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 2048  SCORE 1840 · BEST 6140         ┃
┃ ┌────┬────┬────┬────┐                ┃
┃ │  8 │  2 │  · │  · │                ┃
┃ │ 64 │ 16 │  4 │  · │                ┃
┃ └────┴────┴────┴────┘                ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
   ▲
 ◀   ▶          (B) (A)
   ▼        SELECT  START
```

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
| **2048** | Arrow keys / WASD, or the on-screen D-pad. START deals a new board. |
| **Minesweeper**: 9×9 with 10 mines, and your first dig is always safe | Click to dig, right-click to flag. The **FLAG** toggle makes clicks flag. With the keyboard: D-pad to move, A to dig, B to flag. |
| **Mini crossword**: 30 original 5×5 puzzles | Click a square, type letters, Backspace to erase. Enter (or A) switches across/down. Puzzles you've solved are tracked. |

Click the game screen first so it receives your key presses. Esc takes you back
to the prompt.

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
hooks/ui/                       drawing: pane tree, grid builders, the desktop LCD Client
types/index.d.ts                every $.state value the mod keeps
tests/                          unit tests + a desktop pane test of the whole loop
scripts/                        dev tools (below)
```

Rendering stays in `hooks/ui/`. `grid.ts` turns game state into plain cells,
and only `pane.tsx` and `screen.tsx` know about surfaces, so adding a terminal
surface is a contained change.

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
- `preview.ts`: drives the pane through every state and renders an HTML contact
  sheet (`bun scripts/preview.ts --out .preview/index.html`).
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
