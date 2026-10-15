import type { Mines, MinesStatus } from '../../types'
import { rollInt } from './rng'

export type { Mines, MinesStatus }

export const newGame = (seed: number, w = 9, h = 9, mineCount = 10): Mines => ({
  w, h, mineCount,
  mines: [],
  revealed: Array(w * h).fill(false),
  flagged: Array(w * h).fill(false),
  status: 'ready',
  cursor: Math.floor((h / 2)) * w + Math.floor(w / 2),
  seed: seed >>> 0,
  elapsedMs: 0,
  runningSince: null,
  exploded: null,
})

export const neighbors = (s: Pick<Mines, 'w' | 'h'>, i: number): number[] => {
  const r = Math.floor(i / s.w)
  const c = i % s.w
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < s.h && cc >= 0 && cc < s.w) out.push(rr * s.w + cc)
    }
  return out
}

export const adjacentMines = (s: Mines, i: number): number =>
  neighbors(s, i).filter(n => s.mines.includes(n)).length

const placeMines = (s: Mines, safe: number): Mines => {
  const banned = new Set([safe, ...neighbors(s, safe)])
  const pool = Array.from({ length: s.w * s.h }, (_, i) => i).filter(i => !banned.has(i))
  const mines: number[] = []
  let seed = s.seed
  while (mines.length < s.mineCount && pool.length > 0) {
    const r = rollInt(seed, pool.length)
    seed = r.seed
    mines.push(pool.splice(r.value, 1)[0]!)
  }
  return { ...s, mines, seed }
}

/** Starts (or resumes) the play clock. */
export const resume = (s: Mines, now: number): Mines =>
  s.status === 'playing' && s.runningSince === null ? { ...s, runningSince: now } : s

/** Banks the running clock: the board is frozen exactly as it is. */
export const pause = (s: Mines, now: number): Mines =>
  s.runningSince === null ? s : { ...s, elapsedMs: s.elapsedMs + (now - s.runningSince), runningSince: null }

export const elapsed = (s: Mines, now: number): number =>
  s.elapsedMs + (s.runningSince === null ? 0 : now - s.runningSince)

const isCleared = (s: Mines): boolean =>
  s.revealed.every((open, i) => open || s.mines.includes(i))

export const reveal = (s0: Mines, i: number, now: number): Mines => {
  if (s0.status === 'won' || s0.status === 'lost') return s0
  if (s0.revealed[i] || s0.flagged[i]) return s0
  let s = s0.status === 'ready' ? { ...placeMines(s0, i), status: 'playing' as const, runningSince: now } : resume(s0, now)
  if (s.mines.includes(i)) {
    const revealed = s.revealed.map((v, j) => v || s.mines.includes(j))
    return pause({ ...s, revealed, status: 'lost', exploded: i, cursor: i }, now)
  }
  const revealed = [...s.revealed]
  const stack = [i]
  while (stack.length > 0) {
    const j = stack.pop()!
    if (revealed[j] || s.flagged[j]) continue
    revealed[j] = true
    if (adjacentMines(s, j) === 0) stack.push(...neighbors(s, j).filter(n => !revealed[n]))
  }
  s = { ...s, revealed, cursor: i }
  return isCleared(s) ? pause({ ...s, status: 'won' }, now) : s
}

export const toggleFlag = (s: Mines, i: number): Mines => {
  if (s.status === 'won' || s.status === 'lost' || s.revealed[i]) return s
  const flagged = [...s.flagged]
  flagged[i] = !flagged[i]
  return { ...s, flagged, cursor: i }
}

export const moveCursor = (s: Mines, dir: 'up' | 'down' | 'left' | 'right'): Mines => {
  const r = Math.floor(s.cursor / s.w)
  const c = s.cursor % s.w
  const nr = Math.min(s.h - 1, Math.max(0, r + (dir === 'down' ? 1 : dir === 'up' ? -1 : 0)))
  const nc = Math.min(s.w - 1, Math.max(0, c + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0)))
  return { ...s, cursor: nr * s.w + nc }
}

export const flagsLeft = (s: Mines): number => s.mineCount - s.flagged.filter(Boolean).length
