import { describe, expect, test } from 'claude-code/testing'
import { adjacentMines, elapsed, flagsLeft, moveCursor, newGame, pause, resume, reveal, toggleFlag } from '../hooks/games/minesweeper'
import type { Mines } from '../hooks/games/minesweeper'

/** A 3x3 board with one mine in the corner, already started. */
const tiny = (): Mines => ({ ...newGame(1, 3, 3, 1), mines: [8], status: 'playing', runningSince: 0 })

describe('minesweeper', () => {
  test('a new board is 9x9 with 10 mines, unplaced until the first click', () => {
    const m = newGame(5)
    expect(m.w * m.h).toBe(81)
    expect(m.mineCount).toBe(10)
    expect(m.mines).toEqual([])
    expect(m.status).toBe('ready')
  })

  test('the first reveal is always safe, and its neighbours too', () => {
    for (let seed = 0; seed < 25; seed++) {
      const m = reveal(newGame(seed), 40, 1000)
      expect(m.status === 'playing' || m.status === 'won').toBe(true)
      expect(m.mines).toHaveLength(10)
      expect(m.mines.includes(40)).toBe(false)
      expect(adjacentMines(m, 40)).toBe(0)
    }
  })

  test('revealing a zero floods open its region', () => {
    const m = reveal(tiny(), 0, 10)
    expect(m.revealed.filter(Boolean).length).toBe(8)
    expect(m.status).toBe('won')
  })

  test('revealing a mine loses, shows every mine, and stops the clock', () => {
    const m = reveal(tiny(), 8, 5000)
    expect(m.status).toBe('lost')
    expect(m.exploded).toBe(8)
    expect(m.runningSince).toBe(null)
    expect(m.elapsedMs).toBe(5000)
  })

  test('a flagged square cannot be revealed; flags count down', () => {
    let m = toggleFlag(tiny(), 8)
    expect(flagsLeft(m)).toBe(0)
    m = reveal(m, 8, 1)
    expect(m.status).toBe('playing')
    expect(flagsLeft(toggleFlag(m, 8))).toBe(1)
  })

  test('pause banks time exactly; resume restarts the clock', () => {
    let m: Mines = { ...tiny(), runningSince: 1000 }
    m = pause(m, 4000)
    expect(m.elapsedMs).toBe(3000)
    expect(elapsed(m, 99_999)).toBe(3000) // frozen while paused
    m = resume(m, 10_000)
    expect(elapsed(m, 12_000)).toBe(5000)
  })

  test('the cursor stays on the board', () => {
    let m = newGame(1)
    for (let i = 0; i < 20; i++) m = moveCursor(m, 'left')
    expect(m.cursor % m.w).toBe(0)
    for (let i = 0; i < 20; i++) m = moveCursor(m, 'down')
    expect(Math.floor(m.cursor / m.w)).toBe(8)
  })
})
