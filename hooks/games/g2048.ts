import type { Dir, G2048 } from '../../types'
import { roll, rollInt } from './rng'

export type { Dir, G2048 }

export const SIZE = 4

const spawn = (s: G2048): G2048 => {
  const empty = s.board.flatMap((v, i) => (v === 0 ? [i] : []))
  if (empty.length === 0) return s
  const pick = rollInt(s.seed, empty.length)
  const four = roll(pick.seed)
  const board = [...s.board]
  board[empty[pick.value]!] = four.value < 0.1 ? 4 : 2
  return { ...s, board, seed: four.seed }
}

export const newGame = (seed: number): G2048 =>
  spawn(spawn({ board: Array(16).fill(0), score: 0, seed: seed >>> 0, moves: 0, isOver: false, hasWon: false }))

/** Slides one line toward index 0, merging each pair once. */
export const slideLine = (line: readonly number[]): { line: number[]; gained: number } => {
  const tiles = line.filter(v => v !== 0)
  const out: number[] = []
  let gained = 0
  for (let i = 0; i < tiles.length; i++) {
    const v = tiles[i]!
    if (tiles[i + 1] === v) {
      out.push(v * 2)
      gained += v * 2
      i++
    } else out.push(v)
  }
  while (out.length < line.length) out.push(0)
  return { line: out, gained }
}

const lineIndices = (dir: Dir, k: number): number[] => {
  const idx = [0, 1, 2, 3]
  switch (dir) {
    case 'left': return idx.map(c => k * SIZE + c)
    case 'right': return idx.map(c => k * SIZE + (SIZE - 1 - c))
    case 'up': return idx.map(r => r * SIZE + k)
    case 'down': return idx.map(r => (SIZE - 1 - r) * SIZE + k)
  }
}

const canMove = (board: readonly number[]): boolean =>
  board.some((v, i) => {
    if (v === 0) return true
    const r = Math.floor(i / SIZE)
    const c = i % SIZE
    return (c < SIZE - 1 && board[i + 1] === v) || (r < SIZE - 1 && board[i + SIZE] === v)
  })

/** Applies a move; returns the same object when nothing slid. */
export const move = (s: G2048, dir: Dir): G2048 => {
  if (s.isOver) return s
  const board = [...s.board]
  let gained = 0
  let changed = false
  for (let k = 0; k < SIZE; k++) {
    const ids = lineIndices(dir, k)
    const before = ids.map(i => board[i]!)
    const slid = slideLine(before)
    gained += slid.gained
    ids.forEach((i, j) => {
      if (board[i] !== slid.line[j]) changed = true
      board[i] = slid.line[j]!
    })
  }
  if (!changed) return s
  const next = spawn({ ...s, board, score: s.score + gained, moves: s.moves + 1 })
  return { ...next, hasWon: s.hasWon || next.board.some(v => v >= 2048), isOver: !canMove(next.board) }
}

export const bestTile = (s: G2048): number => Math.max(...s.board)
