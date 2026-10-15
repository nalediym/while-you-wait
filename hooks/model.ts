// The arcade's whole model, pure: what is saved, what the work stats are,
// and how one input changes things. register.tsx wires events to these
// functions; nothing here touches `$`, so all of it is unit-testable.

import * as G2048 from './games/g2048'
import * as Mines from './games/minesweeper'
import * as Cw from './games/crossword'
import type { PuzzleData } from './games/puzzles'
import type { Dir, Live, Save, Screen, Tally } from '../types'
import type { Press } from './ui/hit'

export type { Dir, Live, Save, Screen, Tally }

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

const zero = (): Tally => ({ turns: 0, turnsWhileWaited: 0, workMs: 0, toolCalls: 0, filesEdited: 0, boardsCleared: 0 })

export const dayOf = (now: number): string => {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const freshLive = (): Live => ({
  phase: 'idle', turnId: null, turnStartedAt: null, offeredTurnId: null, banner: null, playedThisTurn: false,
})

export const freshSave = (now: number): Save => ({
  v: 1,
  screen: 'menu',
  menuCursor: 0,
  g2048: null,
  mines: null,
  crossword: null,
  flagMode: false,
  scores: { best2048Tile: 0, best2048Score: 0, minesFastestMs: [], crosswordsSolved: [] },
  stats: { day: dayOf(now), today: zero(), allTime: zero(), todayFiles: [] },
})

/** Accepts whatever the store held; anything unrecognised starts fresh. */
export const loadSave = (raw: unknown, now: number): Save => {
  const fresh = freshSave(now)
  if (typeof raw !== 'object' || raw === null || (raw as { v?: unknown }).v !== 1) return fresh
  const s = raw as Save
  return rollDay({ ...fresh, ...s, scores: { ...fresh.scores, ...s.scores }, stats: { ...fresh.stats, ...s.stats } }, now)
}

/** Starts a new "today" when the date changed. */
export const rollDay = (s: Save, now: number): Save => {
  const day = dayOf(now)
  return s.stats.day === day ? s : { ...s, stats: { ...s.stats, day, today: zero(), todayFiles: [] } }
}

const bump = (s: Save, now: number, f: (t: Tally) => Partial<Tally>): Save => {
  const r = rollDay(s, now)
  return { ...r, stats: { ...r.stats, today: { ...r.stats.today, ...f(r.stats.today) }, allTime: { ...r.stats.allTime, ...f(r.stats.allTime) } } }
}

// ── Claude's side: turns, tools, attention ──────────────────────────────

export const turnStarted = (live: Live, turnId: string, now: number): Live => ({
  ...live, phase: 'working', turnId, turnStartedAt: now, banner: null, playedThisTurn: false,
})

export const needsAttention = (live: Live): Live =>
  live.phase === 'working' ? { ...live, phase: 'attention', banner: 'needs-you' } : live

export const attentionCleared = (live: Live): Live =>
  live.phase === 'attention' ? { ...live, phase: 'working', banner: null } : live

/** `didAnswer`: the turn ended with an answer (not an interrupt or an error). */
export const turnCompleted = (live: Live, save: Save, now: number, didAnswer = true): { live: Live; save: Save } => {
  const ran = live.turnStartedAt === null ? 0 : Math.max(0, now - live.turnStartedAt)
  const saved = bump(pauseAll(save, now), now, t => ({
    turns: t.turns + (didAnswer ? 1 : 0),
    turnsWhileWaited: t.turnsWhileWaited + (live.playedThisTurn ? 1 : 0),
    workMs: t.workMs + ran,
  }))
  return {
    live: { ...live, phase: 'idle', turnStartedAt: null, banner: 'done' },
    save: saved,
  }
}

const EDITING = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

export const toolCalled = (save: Save, tool: string, filePath: string | undefined, now: number): Save => {
  let s = bump(save, now, t => ({ toolCalls: t.toolCalls + 1 }))
  if (EDITING.has(tool) && filePath !== undefined && !s.stats.todayFiles.includes(filePath)) {
    s = bump(s, now, t => ({ filesEdited: t.filesEdited + 1 }))
    s = { ...s, stats: { ...s.stats, todayFiles: [...s.stats.todayFiles, filePath].slice(-500) } }
  }
  return s
}

export const shouldOffer = (live: Live, now: number): boolean =>
  live.phase === 'working' &&
  live.turnStartedAt !== null &&
  now - live.turnStartedAt >= OFFER_AFTER_MS &&
  live.offeredTurnId !== live.turnId

/** Freezes every clock so a paused game resumes exactly where it stopped. */
export const pauseAll = (s: Save, now: number): Save => ({ ...s, mines: s.mines && Mines.pause(s.mines, now) })

// ── Your side: one input ────────────────────────────────────────────────

const recordCleared = (before: Save, after: Save, now: number): Save => {
  let s = after
  const g0 = before.g2048
  const g1 = after.g2048
  if (g1) {
    s = { ...s, scores: { ...s.scores, best2048Tile: Math.max(s.scores.best2048Tile, G2048.bestTile(g1)), best2048Score: Math.max(s.scores.best2048Score, g1.score) } }
    if (g0 && !g0.isOver && g1.isOver) s = bump(s, now, t => ({ boardsCleared: t.boardsCleared + 1 }))
  }
  const m0 = before.mines
  const m1 = after.mines
  if (m1 && m0?.status !== 'won' && m1.status === 'won') {
    const fastest = [...s.scores.minesFastestMs, Mines.elapsed(m1, now)].sort((a, b) => a - b).slice(0, 5)
    s = bump({ ...s, scores: { ...s.scores, minesFastestMs: fastest } }, now, t => ({ boardsCleared: t.boardsCleared + 1 }))
  }
  const c0 = before.crossword
  const c1 = after.crossword
  if (c1 && !c0?.isSolved && c1.isSolved && !s.scores.crosswordsSolved.includes(c1.puzzleId)) {
    s = bump({ ...s, scores: { ...s.scores, crosswordsSolved: [...s.scores.crosswordsSolved, c1.puzzleId] } }, now, t => ({ boardsCleared: t.boardsCleared + 1 }))
  }
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
export const headline = (t: Tally): string => {
  if (t.turns === 0) return 'Nothing shipped yet today. Give Claude something big.'
  const shipped = `Claude shipped ${plural(t.turns, 'task')}`
  if (t.boardsCleared === 0) return `${shipped} today. Nice delegating.`
  return `${shipped} while you cleared ${plural(t.boardsCleared, 'board')}.`
}
