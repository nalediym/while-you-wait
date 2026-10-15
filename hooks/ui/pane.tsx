// The arcade pane. On a surface that draws Svg (the desktop) it is the
// handheld: one crisp SVG, an invisible input pad laid over it, and a few
// lines of plain text below in the app's own colors. Anywhere else it falls
// back to the Box-and-Button drawing in pane-cells.tsx.

import type { BoxProps, ButtonProps, ClientProps, ElementConstructor, RenderElement, SvgProps, TextProps } from 'claude-code'
import { layout } from '../games/crossword'
import { fmtDuration, headline, plural } from '../model'
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
}

const HINTS: Record<string, string> = {
  menu: 'Click a game, or click the Game Boy and use ↑ ↓ and Enter.',
  '2048': 'Arrows or WASD slide the tiles. START deals a new board.',
  mines: 'Click to dig, right-click (or B) to flag. Click FLAG to make clicks flag.',
  crossword: 'Click a square and type. Enter switches across/down, Backspace erases.',
  scores: 'B or SELECT goes back.',
}

export const drawPane = (els: PaneElements, view: PaneView, act: PaneActions): RenderElement => {
  const { Box, Text, Button, Client, Svg } = els
  if (!Svg || !Client || !view.useClient) return drawCellsPane(els, view, act)
  const { live, save } = view
  const { svg, hit } = drawDevice(view)
  const today = save.stats.today
  const all = save.stats.allTime
  const crossword = save.screen === 'crossword' && live.phase === 'working' ? view.puzzles.find(p => p.id === save.crossword?.puzzleId) : undefined

  return (
    <Box flexDirection="column" alignItems="center">
      <Box flexDirection="column" alignItems="center">
        <Svg source={svg} alt={svgAlt(view)} />
        <Box position="absolute" top={0} left={0} right={0} bottom={0}>
          <Client key="pad" module="./pad.tsx" props={{ hit }} width="100%" height="100%" />
        </Box>
      </Box>

      {live.banner !== null ? (
        <Box marginTop={1}>
          <Button key="jump-back" variant="primary" onPress={act.jumpBack}>
            {live.banner === 'done' ? "↩ Claude's done: back to Claude" : '↩ Claude needs you: go answer'}
          </Button>
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={1} width="100%">
        {live.phase === 'idle' ? (
          <Box flexDirection="column">
            <Text bold wrap="wrap">
              {headline(today)}
            </Text>
            <Text dimColor wrap="wrap">
              {`All-time: ${plural(all.turns, 'task')}, ${fmtDuration(all.workMs)} of Claude's work, ${plural(all.turnsWhileWaited, 'task')} finished while you waited.`}
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
          <Text dimColor wrap="wrap">
            {HINTS[save.screen] ?? ''}
          </Text>
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
