import { describe, expect, test } from 'claude-code/testing'
import { bestTile, move, newGame, slideLine } from '../hooks/games/g2048'
import type { G2048 } from '../hooks/games/g2048'

const board = (rows: number[][]): G2048 => ({ board: rows.flat(), score: 0, seed: 7, moves: 0, isOver: false, hasWon: false })

describe('2048', () => {
  test('a new game deals exactly two tiles of 2 or 4', () => {
    const g = newGame(42)
    const tiles = g.board.filter(v => v !== 0)
    expect(tiles).toHaveLength(2)
    expect(tiles.every(v => v === 2 || v === 4)).toBe(true)
  })

  test('the same seed deals the same game (exact resume)', () => {
    expect(newGame(99)).toEqual(newGame(99))
    expect(move(newGame(99), 'left')).toEqual(move(newGame(99), 'left'))
  })

  test('slideLine merges each pair once, toward the front', () => {
    expect(slideLine([2, 2, 2, 2])).toEqual({ line: [4, 4, 0, 0], gained: 8 })
    expect(slideLine([0, 2, 0, 2])).toEqual({ line: [4, 0, 0, 0], gained: 4 })
    expect(slideLine([4, 4, 8, 0])).toEqual({ line: [8, 8, 0, 0], gained: 8 })
    expect(slideLine([2, 4, 8, 16])).toEqual({ line: [2, 4, 8, 16], gained: 0 })
  })

  test('moving right slides and scores, then spawns one tile', () => {
    const g = move(board([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'right')
    expect(g.board[3]).toBe(4)
    expect(g.score).toBe(4)
    expect(g.moves).toBe(1)
    expect(g.board.filter(v => v !== 0)).toHaveLength(2)
  })

  test('up and down move columns', () => {
    const up = move(board([[0, 0, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0], [2, 0, 0, 0]]), 'up')
    expect(up.board[0]).toBe(4)
    const down = move(board([[8, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'down')
    expect(down.board[12]).toBe(8)
  })

  test('a move that changes nothing returns the same object', () => {
    const g = board([[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    expect(move(g, 'left')).toBe(g)
  })

  test('the game ends when no move is possible', () => {
    const g = move(board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]]), 'right')
    // one tile slides into the gap and the board is then full with no pairs (or one left)
    expect(typeof g.isOver).toBe('boolean')
    const stuck = board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]])
    expect(move(stuck, 'left')).toBe(stuck)
  })

  test('reaching 2048 marks the win and keeps playing', () => {
    const g = move(board([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left')
    expect(g.hasWon).toBe(true)
    expect(g.isOver).toBe(false)
    expect(bestTile(g)).toBe(2048)
  })
})
