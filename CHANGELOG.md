# Changelog

Installed copies update when `version` in `.claude-plugin/plugin.json` changes.

## 0.3.7 (2026-10-15)

- **Removed** the invisible click layer over the screen, and everything that
  fed it: screen taps, the click log, and the `Client` LCD in the fallback
  drawing. The desktop app never sends clicks to a drawing, so none of it ever
  ran. Every control is a real button.
- **Changed:** the debug tool and the event timeline are off unless the new
  **Developer tools** option (`devTools`) is on. Players get no extra tool, and
  nothing extra is written to the store.
- **Added** `scripts/check.sh` (every check in one go), CI, `CONTRIBUTING.md`
  and this changelog.

## 0.3.6

- Background workflows count as agents. `$.agent.list()` leaves a workflow's
  agents out, so a run now counts from its `Workflow` call. The engine's list of
  background work in flight corrects the count whenever Claude or an agent stops.

## 0.3.5

- Keyboard mode asks you to click its field. The desktop accepts a focus
  request, but keys don't land there.

## 0.3.4

- Debug: the timeline records what the keyboard field receives.

## 0.3.3

- A **⌨ Use keyboard** button replaces the always-visible keyboard box.

## 0.3.2

- Keyboard mode: W A S D, Z, X and N play every game. The desktop gives a
  pane's buttons no keys, so keyboard mode is a text field.

## 0.3.1

- Fixed a race where a turn starting just as the last agent finished could be
  undone. Where Claude is now lives in module memory, behind a serial queue.

## 0.3.0

- Real buttons under the drawn screen: the D-pad, B, A, SELECT, START and FLAG.
- `/games test` makes the arcade playable anytime in that session.
- A self-test tool for checking the plugin against the real engine.

## 0.2.0

- The arcade is redrawn as a handheld SVG with a real 160×144 LCD and a
  pixel font.
- Stats count the current session only. Games and bests carry over, and
  several sessions share them without overwriting each other.
- Background agents keep the arcade unlocked, with a count on the screen. The
  *Claude's done* banner waits for the last agent to finish.

## 0.1.0

- First release. You get 2048, Minesweeper and 30 original 5×5 mini
  crosswords, playable only while Claude works:
  - `/games` opens the pane, and it offers itself after Claude has been busy
    for 60 seconds.
  - It locks with *"Claude's resting"* when Claude is idle.
  - When Claude finishes or needs you, the game pauses, saves, and shows a
    banner with a way back.
