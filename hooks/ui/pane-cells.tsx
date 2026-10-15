// The arcade drawn from plain Boxes and Buttons: the fallback for every
// surface but the desktop (where the handheld was checked live), and the seam
// for a terminal surface. Pure drawing from the model; every press goes out
// through `act`.

import type { BoxProps, ButtonProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'
import * as G2048 from '../games/g2048'
import * as Mines from '../games/minesweeper'
import { entryAt, layout } from '../games/crossword'
import type { PuzzleData } from '../games/puzzles'
import type { Input, Live, Save, SessionStats } from '../model'
import { GAMES, MENU, fmtClock, fmtDuration, headline, plural } from '../model'
import { drawGrid } from './draw-grid'
import type { Grid } from './grid'
import { grid2048, gridCrossword, gridMines } from './grid'
import { GB } from './palette'

export type PaneElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

export type PaneView = {
  save: Save
  live: Live
  /** This session's work stats (never stored). */
  session: SessionStats
  now: number
  puzzles: readonly PuzzleData[]
  /** Draw the handheld (Svg + real buttons) rather than plain Boxes. */
  handheld: boolean
}

export type PaneActions = {
  send: (input: Input) => void
  jumpBack: () => void
  /** The keyboard field changed (a key typed or erased), or Enter was pressed in it. */
  typed: (value: string) => void
  entered: (value: string) => void
  /** The ⌨ button: keyboard mode on or off. */
  toggleKeyboard: () => void
}

export const drawCellsPane = (els: PaneElements, view: PaneView, act: PaneActions): RenderElement => {
  const { Box, Text, Button } = els
  const { live, save } = view
  const isWorking = live.phase === 'working' || live.testMode

  const banner =
    live.banner === null ? null : (
      <Box flexDirection="column" backgroundColor={GB.darkest} paddingX={1} marginBottom={1}>
        <Text color={GB.lightest} bold>
          {live.banner === 'done' ? "✓ CLAUDE'S DONE" : '! CLAUDE NEEDS YOU'}
        </Text>
        <Text color={GB.light} wrap="wrap">{live.banner === 'done' ? 'Game saved exactly where you left it.' : 'Game paused & saved. Go answer Claude.'}</Text>
        <Button key="jump-back" variant="primary" onPress={act.jumpBack}>
          ↩ Back to Claude
        </Button>
      </Box>
    )

  let body: RenderElement
  if (live.phase === 'idle') body = drawResting(els, view)
  else if (live.phase === 'attention') body = drawPaused(els, view)
  else body = drawScreen(els, view, act)

  return (
    <Box flexDirection="column" backgroundColor={GB.dark} padding={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text color={GB.lightest} bold>
          ◆ WHILE-YOU-WAIT
        </Text>
        <Text color={isWorking ? GB.lightest : GB.light}>{isWorking ? '● CLAUDE WORKING' : live.phase === 'attention' ? '◐ WAITING ON YOU' : '○ RESTING'}</Text>
      </Box>
      {banner}
      <Box flexDirection="column" backgroundColor={GB.lightest} borderStyle="bold" borderColor={GB.darkest} paddingX={1}>
        {body}
      </Box>
      {isWorking && save.screen !== 'scores' ? drawControls(els, view, act) : null}
      <Text color={GB.light} wrap="wrap">
        {isWorking ? 'Play with the buttons above.' : 'Playable only while Claude works.'}
      </Text>
    </Box>
  )
}

// ── Screens ─────────────────────────────────────────────────────────────

const drawScreen = (els: PaneElements, view: PaneView, act: PaneActions): RenderElement => {
  const { Box, Text, Button } = els
  const { save } = view
  switch (save.screen) {
    case 'menu':
      return (
        <Box flexDirection="column" paddingY={1}>
          <Text color={GB.darkest} bold>
            SELECT GAME
          </Text>
          {MENU.map((screen, i) => {
            const game = GAMES.find(g => g.id === screen)
            const isCursor = i === save.menuCursor
            const hasSave = (screen === '2048' && save.g2048) || (screen === 'mines' && save.mines) || (screen === 'crossword' && save.crossword)
            return (
              <Button key={`open-${screen}`} plain onPress={() => act.send({ kind: 'open', screen })}>
                {isCursor ? '▶ ' : '  '}
                {game?.name ?? 'SCORES'} <Text dimColor>{game ? (hasSave ? 'continue' : game.blurb) : 'stats & bests'}</Text>
              </Button>
            )
          })}
        </Box>
      )
    case 'scores':
      return (
        <Box flexDirection="column" paddingY={1}>
          {drawStats(els, view)}
          <Button key="back" onPress={() => act.send({ kind: 'select' })}>
            ◀ Back
          </Button>
        </Box>
      )
    case '2048': {
      const g = save.g2048
      if (!g) return <Text color={GB.darkest}>…</Text>
      const status = g.isOver ? 'NO MOVES — START for a new board' : g.hasWon ? '2048! Keep going?' : ''
      return (
        <Box flexDirection="column" paddingY={1}>
          <Text color={GB.darkest} bold>
            2048 <Text color={GB.dark}>SCORE {g.score} · BEST {Math.max(save.scores.best2048Score, g.score)}</Text>
          </Text>
          {drawLcd(els, grid2048(g))}
          {status ? <Text color={GB.darkest} bold wrap="wrap">{status}</Text> : null}
        </Box>
      )
    }
    case 'mines': {
      const m = save.mines
      if (!m) return <Text color={GB.darkest}>…</Text>
      const status =
        m.status === 'won' ? `CLEARED in ${fmtClock(Mines.elapsed(m, view.now))}!` : m.status === 'lost' ? 'BOOM. START for a new board.' : m.status === 'ready' ? 'A digs. The first square is always safe.' : ''
      return (
        <Box flexDirection="column" paddingY={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={GB.darkest} bold>
              MINES <Text color={GB.dark}>▲{Mines.flagsLeft(m)} · {fmtClock(Mines.elapsed(m, view.now))}</Text>
            </Text>
            <Button key="flag-mode" plain onPress={() => act.send({ kind: 'flagMode' })}>
              FLAG {save.flagMode ? 'ON' : 'OFF'}
            </Button>
          </Box>
          {drawLcd(els, gridMines(m, false))}
          {status ? <Text color={GB.darkest} bold wrap="wrap">{status}</Text> : null}
        </Box>
      )
    }
    case 'crossword': {
      const c = save.crossword
      const p = view.puzzles.find(q => q.id === c?.puzzleId)
      if (!c || !p) return <Text color={GB.darkest}>No puzzles bundled.</Text>
      const entry = entryAt(p, c)
      const clue = entry ? p.clues[entry.dir][String(entry.num)] : undefined
      const solved = view.save.scores.crosswordsSolved.length
      return (
        <Box flexDirection="column" paddingY={1}>
          <Text color={GB.darkest} bold>
            {p.title.toUpperCase()} <Text color={GB.dark}>{solved}/{view.puzzles.length} solved</Text>
          </Text>
          {drawLcd(els, gridCrossword(p, c, false))}
          {c.isSolved ? (
            <Box flexDirection="column">
              <Text color={GB.darkest} bold>SOLVED! ✦</Text>
              <Button key="next-puzzle" onPress={() => act.send({ kind: 'nextPuzzle' })}>
                Next puzzle ▶
              </Button>
            </Box>
          ) : entry ? (
            <Text color={GB.darkest} bold wrap="wrap">
              {entry.num}
              {entry.dir === 'across' ? 'A' : 'D'} {clue ?? ''}
            </Text>
          ) : null}
          {drawClueList(els, p)}
        </Box>
      )
    }
  }
}

const drawClueList = ({ Box, Text }: PaneElements, p: PuzzleData): RenderElement => {
  const { entries } = layout(p)
  return (
    <Box flexDirection="column" marginTop={1}>
      {(['across', 'down'] as const).map(dir => (
        <Box flexDirection="column">
          <Text color={GB.dark} bold>
            {dir.toUpperCase()}
          </Text>
          {entries
            .filter(e => e.dir === dir)
            .map(e => (
              <Text color={GB.dark} wrap="wrap">
                {String(e.num).padStart(2)} {p.clues[dir][String(e.num)] ?? ''}
              </Text>
            ))}
        </Box>
      ))}
    </Box>
  )
}

const drawLcd = (els: PaneElements, grid: Grid): RenderElement => {
  const { Box } = els
  return (
    <Box marginY={1} flexDirection="row">
      {drawGrid(els, grid)}
    </Box>
  )
}

const drawPaused = (els: PaneElements, view: PaneView): RenderElement => {
  const { Box, Text } = els
  const { save } = view
  const game = GAMES.find(g => g.id === save.screen)
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text color={GB.darkest} bold>
        ❚❚ PAUSED
      </Text>
      <Text color={GB.dark} wrap="wrap">{game ? `${game.name} is frozen exactly as you left it.` : 'Nothing running.'}</Text>
    </Box>
  )
}

const drawResting = (els: PaneElements, view: PaneView): RenderElement => {
  const { Box, Text } = els
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text color={GB.darkest} bold>
        CLAUDE'S RESTING
      </Text>
      <Text color={GB.dark} wrap="wrap">— go ship something. ✦</Text>
      <Box marginTop={1} flexDirection="column">
        {drawStats(els, view)}
      </Box>
    </Box>
  )
}

// Work stats first and loud; game bests after and quiet.
const drawStats = ({ Box, Text }: PaneElements, view: PaneView): RenderElement => {
  const sc = view.save.scores
  const t = view.session
  return (
    <Box flexDirection="column">
      <Text color={GB.darkest} bold wrap="wrap">
        {headline(t)}
      </Text>
      <Text color={GB.darkest} bold>
        THIS SESSION
      </Text>
      <Text color={GB.darkest} wrap="wrap">
        {`${plural(t.turns, 'task')} · ${fmtDuration(t.workMs)} of work · ${plural(t.toolCalls, 'tool call')} · ${plural(t.filesEdited, 'file')} edited`}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={GB.dark}>BESTS</Text>
        <Text color={GB.dark} wrap="wrap">
          {`2048 tile ${sc.best2048Tile || '—'} · score ${sc.best2048Score || '—'}`}
        </Text>
        <Text color={GB.dark} wrap="wrap">
          {`Mines ${sc.minesFastestMs.length ? sc.minesFastestMs.slice(0, 3).map(fmtClock).join(' / ') : '—'}`}
        </Text>
        <Text color={GB.dark} wrap="wrap">
          {`Crosswords ${sc.crosswordsSolved.length}/${view.puzzles.length} · boards this session ${t.boardsCleared}`}
        </Text>
      </Box>
    </Box>
  )
}

// ── Controls: a D-pad, A/B, SELECT/START ─────────────────────────────────

const drawControls = ({ Box, Button, Text }: PaneElements, view: PaneView, act: PaneActions): RenderElement => {
  const screen = view.save.screen
  // Letters type into the crossword, so its buttons take no letter hotkeys.
  const letters = screen !== 'crossword'
  const pad = (dir: 'up' | 'down' | 'left' | 'right', glyph: string, hotkey: string) => (
    <Button key={`pad-${dir}`} label={glyph} {...(letters ? { hotkey } : {})} onPress={() => act.send({ kind: 'dir', dir })} />
  )
  const aLabel = screen === 'mines' ? 'A dig' : screen === 'crossword' ? 'A ↔↕' : 'A'
  const bLabel = screen === 'mines' ? 'B flag' : screen === 'crossword' ? 'B del' : 'B'
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Box flexDirection="column" alignItems="center">
          {pad('up', '▲', 'w')}
          <Box flexDirection="row" columnGap={1}>
            {pad('left', '◀', 'a')}
            {pad('right', '▶', 'd')}
          </Box>
          {pad('down', '▼', 's')}
        </Box>
        <Box flexDirection="row" columnGap={1}>
          <Button key="btn-b" label={bLabel} {...(letters ? { hotkey: 'x' } : {})} onPress={() => act.send({ kind: 'b' })} />
          <Button key="btn-a" label={aLabel} variant="primary" {...(letters ? { hotkey: 'z' } : {})} onPress={() => act.send({ kind: 'a' })} />
        </Box>
      </Box>
      <Box flexDirection="row" justifyContent="center" columnGap={2} marginTop={1}>
        <Button key="btn-select" label="SELECT" plain onPress={() => act.send({ kind: 'select' })} />
        <Button key="btn-start" label="START" plain onPress={() => act.send({ kind: 'start' })} />
      </Box>
      <Text color={GB.light} wrap="wrap">{screen === 'menu' ? 'SELECT menu · START play' : 'SELECT menu · START new game'}</Text>
    </Box>
  )
}
