// The arcade pane. On a surface that draws Svg (the desktop) it is the
// handheld's screen as one crisp SVG, then real buttons under it: the D-pad,
// B and A, SELECT and START, with hotkeys. (The desktop delivers no clicks to
// a drawing, so nothing drawn pretends to be a button.) Plain text below uses
// the app's own colors. Anywhere else it falls back to pane-cells.tsx.

import type { BoxProps, ButtonProps, ClientProps, ElementConstructor, InputProps, RenderElement, SvgProps, TextProps } from 'claude-code'
import { layout } from '../games/crossword'
import type { Dir, Input } from '../model'
import { GAMES, MENU, headline, isPlayable, plural } from '../model'
import { drawDevice, svgAlt } from './device'
import { drawCellsPane } from './pane-cells'
import type { PaneActions, PaneView } from './pane-cells'

export type { PaneActions, PaneView } from './pane-cells'

export type PaneElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Client?: ElementConstructor<ClientProps>
  Svg?: ElementConstructor<SvgProps>
  Input?: ElementConstructor<InputProps>
}

const HINTS: Record<string, string> = {
  menu: 'Pick a game. ⌨ Use keyboard lets you play with W A S D.',
  '2048': 'Slide the tiles with the D-pad, or ⌨ Use keyboard for W A S D. START deals a new board.',
  mines: 'D-pad moves, A digs, B flags. FLAG makes A plant flags. ⌨ for keys.',
  crossword: 'Turn on ⌨ Use keyboard to type the answers. A switches across/down, B erases.',
  scores: 'B or SELECT goes back.',
}

/** What the keys do in keyboard mode, per screen. */
const KEY_HELP: Record<string, string> = {
  menu: 'W / S move · Z or Enter plays',
  '2048': 'W A S D slide · N = new board',
  mines: 'W A S D move · Z digs · X flags',
  crossword: 'Type letters · Enter switches ↔↕ · Backspace erases',
  scores: 'X goes back',
}

export const drawPane = (els: PaneElements, view: PaneView, act: PaneActions): RenderElement => {
  const { Box, Text, Button, Client, Svg } = els
  if (!Svg || !view.useClient) return drawCellsPane(els, view, act)
  const { live, save } = view
  const { svg, hit } = drawDevice(view)
  const session = view.session
  const playable = isPlayable(live)
  const crossword = save.screen === 'crossword' && playable ? view.puzzles.find(p => p.id === save.crossword?.puzzleId) : undefined

  return (
    <Box flexDirection="column" alignItems="center">
      <Box flexDirection="column" alignItems="center">
        <Svg source={svg} alt={svgAlt(view)} />
        {Client ? (
          // Taps on the screen and keys, where the surface delivers them to a Client.
          <Box position="absolute" top={0} left={0} right={0} bottom={0}>
            <Client key="pad" module="./pad.tsx" props={{ hit }} width="100%" height="100%" />
          </Box>
        ) : null}
      </Box>

      {live.banner !== null ? (
        <Box marginTop={1}>
          <Button key="jump-back" variant="primary" onPress={act.jumpBack}>
            {live.banner === 'done' ? "↩ Claude's done: back to Claude" : '↩ Claude needs you: go answer'}
          </Button>
        </Box>
      ) : null}

      {playable ? drawControls(els, view, act) : null}

      <Box flexDirection="column" marginTop={1} width="100%">
        {live.testMode ? (
          <Text bold wrap="wrap">
            Test mode: playable anytime. /games test turns it off.
          </Text>
        ) : null}
        {live.phase === 'idle' && !live.testMode ? (
          <Box flexDirection="column">
            <Text bold wrap="wrap">
              {headline(session)}
            </Text>
            <Text dimColor wrap="wrap">
              {session.turnsWhileWaited > 0
                ? `${plural(session.turnsWhileWaited, 'task')} finished while you waited.`
                : 'Stats count this session only. Your games and bests carry over.'}
            </Text>
            <Text dimColor wrap="wrap">
              The arcade unlocks while Claude is working.
            </Text>
          </Box>
        ) : live.phase === 'attention' ? (
          <Text dimColor wrap="wrap">
            Your game is saved exactly where you left it.
          </Text>
        ) : (
          <Box flexDirection="column">
            {live.agents > 0 ? (
              <Text bold wrap="wrap">
                {live.isTurnRunning
                  ? `Claude and ${plural(live.agents, 'agent')} working.`
                  : `Claude handed off to ${plural(live.agents, 'background agent')}. Keep playing: you'll see "Claude's done" when the last one finishes.`}
              </Text>
            ) : null}
            <Text dimColor wrap="wrap">
              {HINTS[save.screen] ?? ''}
            </Text>
          </Box>
        )}
        {crossword ? (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>{crossword.title}</Text>
            {(['across', 'down'] as const).map(dir => (
              <Box flexDirection="column" marginTop={1}>
                <Text dimColor bold>
                  {dir.toUpperCase()}
                </Text>
                {layout(crossword)
                  .entries.filter(e => e.dir === dir)
                  .map(e => (
                    <Text wrap="wrap">
                      {`${String(e.num).padStart(2)}  ${crossword.clues[dir][String(e.num)] ?? ''}`}
                    </Text>
                  ))}
              </Box>
            ))}
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

/** Real buttons laid out like the handheld's: D-pad left, B and A right, SELECT and START below. */
const drawControls = ({ Box, Button, Input }: PaneElements, view: PaneView, act: PaneActions): RenderElement => {
  const screen = view.save.screen
  const send = (input: Input) => () => act.send(input)
  // Letters type into the crossword, so its buttons take no letter hotkeys.
  const keys = screen !== 'crossword'
  const pad = (dir: Dir, glyph: string, hotkey: string) => (
    <Button key={`pad-${dir}`} label={glyph} {...(keys ? { hotkey } : {})} onPress={send({ kind: 'dir', dir })} />
  )
  const aLabel = screen === 'mines' ? (view.save.flagMode ? 'A flag' : 'A dig') : screen === 'crossword' ? 'A ↔↕' : 'A'
  const bLabel = screen === 'mines' ? 'B flag' : screen === 'crossword' ? 'B ⌫' : 'B'
  return (
    <Box flexDirection="column" alignItems="center" marginTop={1} width="100%">
      {screen === 'menu' ? (
        <Box flexDirection="row" flexWrap="wrap" justifyContent="center" columnGap={1} marginBottom={1}>
          {MENU.map(id => (
            <Button key={`open-${id}`} variant={id === MENU[view.save.menuCursor] ? 'primary' : 'secondary'} onPress={send({ kind: 'open', screen: id })}>
              {GAMES.find(g => g.id === id)?.name ?? 'SCORES'}
            </Button>
          ))}
        </Box>
      ) : null}
      {Input ? (
        <Box flexDirection="column" alignItems="center" marginBottom={1} width="100%">
          <Button key="keyboard-mode" variant={view.live.keyboardMode ? 'primary' : 'secondary'} onPress={act.toggleKeyboard}>
            {view.live.keyboardMode ? '⌨ Keyboard on' : '⌨ Use keyboard'}
          </Button>
          {view.live.keyboardMode ? (
            // The desktop sends a pane's keys only into a text field, so keyboard mode is one:
            // what you type there is read as game keys. The app accepts a request to focus it
            // but the keys don't land there (checked live), so it says to click it.
            <Box marginTop={1} width="100%">
              <Input
                key="keys"
                label="Keys"
                placeholder={`Click here, then: ${KEY_HELP[screen] ?? 'type'}`}
                value=""
                autoFocus
                onInput={value => act.typed(value)}
                onSubmit={value => act.entered(value)}
              />
            </Box>
          ) : null}
        </Box>
      ) : null}
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%" paddingX={2}>
        <Box flexDirection="column" alignItems="center">
          {pad('up', '▲', 'w')}
          <Box flexDirection="row" columnGap={3}>
            {pad('left', '◀', 'a')}
            {pad('right', '▶', 'd')}
          </Box>
          {pad('down', '▼', 's')}
        </Box>
        <Box flexDirection="row" columnGap={1} alignItems="center">
          <Button key="btn-b" label={bLabel} {...(keys ? { hotkey: 'x' } : {})} onPress={send({ kind: 'b' })} />
          <Button key="btn-a" label={aLabel} variant="primary" {...(keys ? { hotkey: 'z' } : {})} onPress={send({ kind: 'a' })} />
        </Box>
      </Box>
      <Box flexDirection="row" justifyContent="center" columnGap={2} marginTop={1}>
        <Button key="btn-select" label="SELECT" onPress={send({ kind: 'select' })} />
        <Button key="btn-start" label="START" onPress={send({ kind: 'start' })} />
        {screen === 'mines' ? (
          <Button key="flag-mode" label={view.save.flagMode ? 'FLAG: ON' : 'FLAG: OFF'} onPress={send({ kind: 'flagMode' })} />
        ) : null}
      </Box>
    </Box>
  )
}
