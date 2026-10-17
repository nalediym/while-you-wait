# while-you-wait

A tiny Game Boy–style arcade for the Claude desktop app that **only plays while
Claude is working**. Claude works for a minute, and the arcade opens. Claude's
done, and it locks. Your phone stays down.

<p align="center">
  <img src="docs/demo.webp" width="480" alt="A 30-second loop: the arcade is locked while Claude rests, opens by itself after Claude has worked a minute, plays Minesweeper, a crossword and 2048 while two background agents finish, then says Claude's done mid-game">
</p>

## Install

Run this once in your shell, then start a new session in the desktop app's
Code tab:

```bash
claude plugin install while-you-wait --marketplace nalediym/while-you-wait
```

You need Claude Code 2.1.295 or newer. The arcade draws in the desktop app;
terminal support is on the roadmap.

<details>
<summary>Other ways to install</summary>

- **In a terminal session:** run
  `/plugin install while-you-wait --marketplace nalediym/while-you-wait`,
  answer `y` to add the marketplace, then pick a scope.
- **In the desktop app:** run `claude plugin marketplace add nalediym/while-you-wait`
  in your shell once. Then, in a Code tab session, click
  **+ → Plugins → Add plugin** and select **while-you-wait**. (`/plugin`
  doesn't run in the Code tab.)

</details>

## How it works

- After Claude has worked for **60 seconds**, the arcade opens beside the
  transcript. It never takes focus from what you're typing. **`/games`** opens
  it anytime.
- When Claude **finishes** or **needs you**, your game pauses and saves, and a
  banner takes you back to Claude.
- **Background agents and workflows count as Claude working.** The screen shows
  how many are still running (✦2), and *Claude's done* waits for the last one.
- When Claude is idle, the arcade is locked: *Claude's resting, go ship
  something.*
- **`/games test`** makes it playable anytime in that session, so you can try
  it now. Run it again to turn it off.

## Games

<p align="center">
  <img src="docs/2048.svg" width="240" alt="The handheld playing 2048">
  <img src="docs/mines.svg" width="240" alt="The handheld playing Minesweeper">
  <img src="docs/crossword.svg" width="240" alt="The handheld playing a mini crossword">
</p>

- **2048.** The D-pad slides the tiles. START deals a new board.
- **Minesweeper.** 9×9 with 10 mines, and your first dig is always safe. A
  digs, B flags.
- **Mini crossword.** 30 original 5×5 puzzles, with the clues listed under the
  handheld.

The buttons under the screen are real: the D-pad, A, B, SELECT (menu) and START
(new game). **⌨ Use keyboard** lets you play with W A S D, Z for A, X for B and
N for a new game.

## Stats, not streaks

The stats screen leads with Claude's work: tasks shipped, time worked, tool
calls and files edited. *"Claude shipped 14 tasks while you cleared 6 boards."*

Stats reset every session. Your games in progress and your bests carry over,
so you can pick up a game in any session. There are no streaks and no "one more
game" nudges.

## Privacy

The plugin makes no network calls, and nothing leaves your machine. Your games
and bests live in Claude Code's plugin store, and stats live only in the
session's memory. The `devTools` option is off by default. When it's on, the
plugin keeps a timeline of its last 80 events, never prompts or file contents.

## Contributing

New games, crosswords and terminal support are all welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md). `./scripts/check.sh` runs every check.

**Roadmap:** crosswords written by Claude, terminal support, Connect Four,
match-3, snake, and optional sound and notifications.

## License

MIT. The crossword grids and clues are original to this project.
