// The arcade's whole model, pure: what is saved (games and bests), what this
// session's work stats are, and how one input changes things. register.tsx wires events to these
// functions; nothing here touches `$`, so all of it is unit-testable.

import * as G2048 from './games/g2048'
import * as Mines from './games/minesweeper'
import * as Cw from './games/crossword'
import type { PuzzleData } from './games/puzzles'
import type { Dir, Live, Save, Screen, SessionStats } from '../types'
import type { Press } from './ui/hit'

export type { Dir, Live, Save, Screen, SessionStats }

export type GameId = '2048' | 'mines' | 'crossword'

export type Input =
  | { kind: 'dir'; dir: Dir }
  | { kind: 'a' } // reveal / pick / toggle direction
  | { kind: 'b' } // flag / erase / back
  | { kind: 'start' } // new game
  | { kind: 'select' } // back to the menu
  | { kind: 'letter'; ch: string }
  | { kind: 'erase' }
  | { kind: 'tap'; col: number; row: number; button: 'left' | 'right' }
  | { kind: 'open'; screen: Screen }
  | { kind: 'flagMode' }
  | { kind: 'nextPuzzle' }

export const GAMES: readonly { id: GameId; name: string; blurb: string }[] = [
  { id: '2048', name: '2048', blurb: 'slide & merge' },
  { id: 'mines', name: 'MINES', blurb: '9x9, 10 mines' },
  { id: 'crossword', name: 'MINI XWORD', blurb: '5x5, handmade' },
]

export const OFFER_AFTER_MS = 60_000

export const freshSession = (): SessionStats => ({
  turns: 0, turnsWhileWaited: 0, workMs: 0, toolCalls: 0, filesEdited: 0, boardsCleared: 0, files: [],
})

export const freshLive = (): Live => ({
  phase: 'idle', turnId: null, isTurnRunning: false, agents: 0, busySince: null, offeredFor: null, banner: null, playedThisTurn: false,
})

export const freshSave = (): Save => ({
  v: 2,
  screen: 'menu',
  menuCursor: 0,
  g2048: null,
  mines: null,
  crossword: null,
  flagMode: false,
  scores: { best2048Tile: 0, best2048Score: 0, minesFastestMs: [], crosswordsSolved: [] },
})

/**
 * Accepts whatever the store held; anything unrecognised starts fresh. A v1
 * save (which also kept stats) keeps its games and bests; its stats are dropped.
 */
export const loadSave = (raw: unknown): Save => {
  const fresh = freshSave()
  const v = typeof raw === 'object' && raw !== null ? (raw as { v?: unknown }).v : undefined
  if (v !== 1 && v !== 2) return fresh
  const s = raw as Partial<Save>
  return {
    v: 2,
    screen: s.screen ?? fresh.screen,
    menuCursor: s.menuCursor ?? 0,
    g2048: s.g2048 ?? null,
    mines: s.mines ?? null,
    crossword: s.crossword ?? null,
    flagMode: s.flagMode ?? false,
    scores: { ...fresh.scores, ...s.scores },
  }
}

// ── Claude's side: turns, tools, attention ──────────────────────────────

/** Claude is busy while your turn runs or any of its agents is still running. */
export const isBusy = (live: Live): boolean => live.isTurnRunning || live.agents > 0

type Settled = { live: Live; session: SessionStats; becameIdle: boolean }

/** Moves the phase to match what is running: idle -> working, or -> idle with "Claude's done". */
const settle = (live: Live, session: SessionStats, now: number): Settled => {
  if (isBusy(live)) {
    return {
      live: live.phase === 'idle' ? { ...live, phase: 'working', busySince: now, banner: null } : live,
      session,
      becameIdle: false,
    }
  }
  if (live.phase === 'idle') return { live, session, becameIdle: false }
  const ran = live.busySince === null ? 0 : Math.max(0, now - live.busySince)
  return {
    live: { ...live, phase: 'idle', busySince: null, banner: 'done' },
    session: { ...session, workMs: session.workMs + ran },
    becameIdle: true,
  }
}

export const turnStarted = (live: Live, turnId: string, now: number): Live =>
  settle({ ...live, isTurnRunning: true, turnId, banner: null, playedThisTurn: false }, freshSession(), now).live

export const needsAttention = (live: Live): Live =>
  live.phase === 'working' ? { ...live, phase: 'attention', banner: 'needs-you' } : live

export const attentionCleared = (live: Live): Live =>
  live.phase === 'attention' ? { ...live, phase: 'working', banner: null } : live

/**
 * Your turn ended: count it, then go idle unless agents are still running.
 * `didAnswer`: it ended with an answer, not an interrupt or error.
 */
export const turnCompleted = (live: Live, session: SessionStats, now: number, didAnswer = true): Settled => {
  const counted: SessionStats = {
    ...session,
    turns: session.turns + (didAnswer ? 1 : 0),
    turnsWhileWaited: session.turnsWhileWaited + (live.playedThisTurn ? 1 : 0),
  }
  return settle({ ...attentionCleared(live), isTurnRunning: false }, counted, now)
}

/** This session's running-agent count changed. */
export const agentsChanged = (live: Live, session: SessionStats, agents: number, now: number): Settled =>
  settle({ ...live, agents: Math.max(0, agents) }, session, now)

const EDITING = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

export const toolCalled = (session: SessionStats, tool: string, filePath: string | undefined): SessionStats => {
  const isNewFile = EDITING.has(tool) && filePath !== undefined && !session.files.includes(filePath)
  return {
    ...session,
    toolCalls: session.toolCalls + 1,
    ...(isNewFile ? { filesEdited: session.filesEdited + 1, files: [...session.files, filePath].slice(-500) } : {}),
  }
}

/** Offer the pane once per busy stretch, after a minute of Claude working. */
export const shouldOffer = (live: Live, now: number): boolean =>
  live.phase === 'working' &&
  live.busySince !== null &&
  now - live.busySince >= OFFER_AFTER_MS &&
  live.offeredFor !== live.busySince

/** Freezes every clock so a paused game resumes exactly where it stopped. */
export const pauseAll = (s: Save, now: number): Save => ({ ...s, mines: s.mines && Mines.pause(s.mines, now) })

// ── Your side: one input ────────────────────────────────────────────────

/** How many boards this change finished: a 2048 that ran out of moves, a mines clear, a solved crossword. */
export const boardsFinished = (before: Save, after: Save): number =>
  Number(!!(before.g2048 && after.g2048 && !before.g2048.isOver && after.g2048.isOver)) +
  Number(!!(after.mines && before.mines?.status !== 'won' && after.mines.status === 'won')) +
  Number(!!(after.crossword && !before.crossword?.isSolved && after.crossword.isSolved))

/** Updates your bests (kept across sessions) after a change. */
const recordCleared = (before: Save, after: Save, now: number): Save => {
  let s = after
  const g1 = after.g2048
  if (g1) s = { ...s, scores: { ...s.scores, best2048Tile: Math.max(s.scores.best2048Tile, G2048.bestTile(g1)), best2048Score: Math.max(s.scores.best2048Score, g1.score) } }
  const m1 = after.mines
  if (m1 && before.mines?.status !== 'won' && m1.status === 'won') {
    const fastest = [...s.scores.minesFastestMs, Mines.elapsed(m1, now)].sort((a, b) => a - b).slice(0, 5)
    s = { ...s, scores: { ...s.scores, minesFastestMs: fastest } }
  }
  const c1 = after.crossword
  if (c1 && !before.crossword?.isSolved && c1.isSolved && !s.scores.crosswordsSolved.includes(c1.puzzleId))
    s = { ...s, scores: { ...s.scores, crosswordsSolved: [...s.scores.crosswordsSolved, c1.puzzleId] } }
  return s
}

const puzzleOf = (s: Save, puzzles: readonly PuzzleData[]): PuzzleData | undefined =>
  puzzles.find(p => p.id === s.crossword?.puzzleId)

const startCrossword = (s: Save, puzzles: readonly PuzzleData[], after?: string): Save => {
  const p = Cw.nextPuzzle(puzzles, s.scores.crosswordsSolved, after) ?? puzzles[0]
  return p ? { ...s, crossword: Cw.newGame(p) } : s
}

export const openScreen = (s: Save, screen: Screen, now: number, puzzles: readonly PuzzleData[]): Save => {
  const seed = Math.floor(now) >>> 0
  if (screen === '2048' && !s.g2048) return { ...s, screen, g2048: G2048.newGame(seed) }
  if (screen === 'mines' && !s.mines) return { ...s, screen, mines: Mines.newGame(seed) }
  if (screen === 'crossword' && !s.crossword) return { ...startCrossword(s, puzzles), screen }
  return { ...s, screen }
}

/** The menu's rows, in order: the games, then the scores page. */
export const MENU: readonly Screen[] = ['2048', 'mines', 'crossword', 'scores']

/**
 * One input, applied only while Claude is working. Returns the save
 * unchanged (same object) when the input did nothing.
 */
export const act = (s: Save, input: Input, live: Live, now: number, puzzles: readonly PuzzleData[]): Save => {
  if (live.phase !== 'working') return s
  if (input.kind === 'select') return s.screen === 'menu' ? s : { ...pauseAll(s, now), screen: 'menu' }
  if (input.kind === 'open') return openScreen(s, input.screen, now, puzzles)

  switch (s.screen) {
    case 'menu': {
      if (input.kind === 'dir' && (input.dir === 'up' || input.dir === 'down')) {
        const n = MENU.length
        return { ...s, menuCursor: (s.menuCursor + (input.dir === 'down' ? 1 : n - 1)) % n }
      }
      if (input.kind === 'a' || input.kind === 'start') return openScreen(s, MENU[s.menuCursor] ?? 'menu', now, puzzles)
      return s
    }
    case 'scores':
      return input.kind === 'b' ? { ...s, screen: 'menu' } : s
    case '2048': {
      const g = s.g2048
      if (!g) return s
      if (input.kind === 'start') return recordCleared(s, { ...s, g2048: G2048.newGame((g.seed ^ now) >>> 0) }, now)
      if (input.kind === 'b') return { ...s, screen: 'menu' }
      if (input.kind !== 'dir') return s
      const moved = G2048.move(g, input.dir)
      return moved === g ? s : recordCleared(s, { ...s, g2048: moved }, now)
    }
    case 'mines': {
      if (!s.mines) return s
      const m = Mines.resume(s.mines, now) // the clock runs again from your first input after a pause
      if (input.kind === 'start') return { ...s, mines: Mines.newGame((m.seed ^ now) >>> 0) }
      if (input.kind === 'flagMode') return { ...s, mines: m, flagMode: !s.flagMode }
      if (input.kind === 'dir') return { ...s, mines: Mines.moveCursor(m, input.dir) }
      if (input.kind === 'b' && s.mines.status !== 'playing' && s.mines.status !== 'ready') return { ...s, screen: 'menu' }
      const at = input.kind === 'tap' ? input.row * m.w + input.col : m.cursor
      if (input.kind === 'tap' && (input.col < 0 || input.col >= m.w || input.row < 0 || input.row >= m.h)) return s
      const flag = input.kind === 'b' || (input.kind === 'tap' && (input.button === 'right' || s.flagMode))
      const reveal = input.kind === 'a' || (input.kind === 'tap' && !flag)
      if (!flag && !reveal) return s
      const next = flag ? Mines.toggleFlag(m, at) : Mines.reveal(m, at, now)
      return recordCleared(s, { ...s, mines: next }, now)
    }
    case 'crossword': {
      const c = s.crossword
      const p = puzzleOf(s, puzzles)
      if (!c || !p) return s
      if (input.kind === 'start' || input.kind === 'nextPuzzle') {
        if (input.kind === 'start' && !c.isSolved) return { ...s, crossword: Cw.newGame(p) } // clear the grid
        return startCrossword(s, puzzles, p.id)
      }
      let next = c
      if (input.kind === 'dir') next = Cw.moveCursor(p, c, input.dir)
      else if (input.kind === 'letter') next = Cw.typeLetter(p, c, input.ch)
      else if (input.kind === 'erase' || input.kind === 'b') next = Cw.erase(p, c)
      else if (input.kind === 'a') next = Cw.toggleDir(p, c)
      else if (input.kind === 'tap' && input.col >= 0 && input.col < Cw.N && input.row >= 0 && input.row < Cw.N)
        next = Cw.select(p, c, input.row * Cw.N + input.col)
      return next === c ? s : recordCleared(s, { ...s, crossword: next }, now)
    }
  }
}

/** A press on the drawn handheld -> an input, per screen. */
export const pressToInput = (
  screen: Screen,
  press: Press,
  button: 'left' | 'right',
): Input | undefined => {
  switch (press.kind) {
    case 'cell': return { kind: 'tap', col: press.col, row: press.row, button }
    case 'row': return screen === 'menu' ? { kind: 'open', screen: MENU[press.index] ?? 'menu' } : undefined
    case 'dir': return { kind: 'dir', dir: press.dir }
    case 'a': return { kind: 'a' }
    case 'b': return { kind: 'b' }
    case 'select': return { kind: 'select' }
    case 'start': return { kind: 'start' }
    case 'header': return screen === 'mines' ? { kind: 'flagMode' } : undefined
    case 'lcd': return undefined
  }
}

// ── Words for the stats page ────────────────────────────────────────────

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

export const fmtDuration = (ms: number): string => {
  const m = Math.round(ms / 60_000)
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export const fmtClock = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The encouraging headline: Claude's work first, your games second. */
export const headline = (t: SessionStats): string => {
  if (t.turns === 0) return 'Nothing shipped yet this session. Give Claude something big.'
  const shipped = `Claude shipped ${plural(t.turns, 'task')}`
  if (t.boardsCleared === 0) return `${shipped} this session. Nice delegating.`
  return `${shipped} while you cleared ${plural(t.boardsCleared, 'board')}.`
}
