import { describe, expect, test } from 'claude-code/testing'
import { entryAt, erase, layout, moveCursor, newGame, nextPuzzle, toggleDir, typeLetter } from '../hooks/games/crossword'
import type { PuzzleData } from '../hooks/games/puzzles'

const P: PuzzleData = {
  id: 't-1',
  title: 'Test',
  grid: ['#HAT#', 'SOLAR', 'OPERA', 'APRON', '#ESS#'],
  clues: { across: {}, down: {} },
}

const solve = (p: PuzzleData) => {
  let s = newGame(p)
  const { entries } = layout(p)
  for (const e of entries.filter(x => x.dir === 'across'))
    for (const i of e.cells) s = typeLetter(p, { ...s, cursor: i, dir: 'across' }, p.grid[Math.floor(i / 5)]![i % 5]!)
  return s
}

describe('crossword', () => {
  test('standard numbering', () => {
    const { numbers, entries } = layout(P)
    expect(numbers.slice(0, 5)).toEqual([null, 1, 2, 3, null])
    expect(numbers[5]).toBe(4)
    expect(numbers[10]).toBe(6)
    expect(entries.find(e => e.num === 1 && e.dir === 'across')?.answer).toBe('HAT')
    expect(entries.find(e => e.num === 1 && e.dir === 'down')?.answer).toBe('HOPPE')
    expect(entries.find(e => e.num === 4 && e.dir === 'across')?.answer).toBe('SOLAR')
  })

  test('typing fills and advances within the word', () => {
    let s = newGame(P)
    expect(s.cursor).toBe(1)
    s = typeLetter(P, s, 'h')
    expect(s.letters[1]).toBe('H')
    expect(s.cursor).toBe(2)
  })

  test('backspace clears, then steps back', () => {
    let s = typeLetter(P, newGame(P), 'H')
    s = erase(P, s) // cell 2 is empty: step back and clear cell 1
    expect(s.cursor).toBe(1)
    expect(s.letters[1]).toBe('')
  })

  test('arrows turn the cursor first, then move, skipping blocks', () => {
    let s = { ...newGame(P), cursor: 6 }
    s = moveCursor(P, s, 'down')
    expect(s.dir).toBe('down')
    expect(s.cursor).toBe(6)
    s = moveCursor(P, s, 'down')
    expect(s.cursor).toBe(11)
    s = { ...s, dir: 'across', cursor: 5 }
    expect(moveCursor(P, s, 'up').cursor).toBe(5) // turned only
  })

  test('A toggles the direction where the square has both', () => {
    const s = newGame(P)
    expect(toggleDir(P, s).dir).toBe('down')
    expect(entryAt(P, { cursor: 1, dir: 'down' })?.answer).toBe('HOPPE')
  })

  test('filling every answer solves it, and a solved grid is frozen', () => {
    const s = solve(P)
    expect(s.isSolved).toBe(true)
    expect(typeLetter(P, s, 'Z')).toBe(s)
  })

  test('nextPuzzle skips solved ones and wraps', () => {
    const all = [P, { ...P, id: 't-2' }, { ...P, id: 't-3' }]
    expect(nextPuzzle(all, ['t-1'])?.id).toBe('t-2')
    expect(nextPuzzle(all, [], 't-3')?.id).toBe('t-1')
    expect(nextPuzzle(all, ['t-1', 't-2', 't-3'])).toBe(undefined)
  })
})
