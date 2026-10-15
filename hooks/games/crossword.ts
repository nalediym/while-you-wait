import type { Crossword, Direction } from '../../types'
import type { PuzzleData } from './puzzles'

export type { Crossword, Direction }

export type Entry = { num: number; dir: Direction; cells: number[]; answer: string }

export const N = 5

export const isBlock = (p: PuzzleData, i: number): boolean => p.grid[Math.floor(i / N)]![i % N] === '#'
const solution = (p: PuzzleData, i: number): string => p.grid[Math.floor(i / N)]![i % N]!

/** Standard numbering: a white cell is numbered if it starts an across or a down run. */
export const layout = (p: PuzzleData): { numbers: (number | null)[]; entries: Entry[] } => {
  const numbers: (number | null)[] = Array(N * N).fill(null)
  const entries: Entry[] = []
  const white = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N && !isBlock(p, r * N + c)
  let next = 1
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      if (!white(r, c)) continue
      const startsAcross = !white(r, c - 1) && white(r, c + 1)
      const startsDown = !white(r - 1, c) && white(r + 1, c)
      if (!startsAcross && !startsDown) continue
      const num = next++
      numbers[r * N + c] = num
      for (const [dir, ok, dr, dc] of [['across', startsAcross, 0, 1], ['down', startsDown, 1, 0]] as const) {
        if (!ok) continue
        const cells: number[] = []
        for (let rr = r, cc = c; white(rr, cc); rr += dr, cc += dc) cells.push(rr * N + cc)
        entries.push({ num, dir, cells, answer: cells.map(i => solution(p, i)).join('') })
      }
    }
  return { numbers, entries }
}

export const newGame = (p: PuzzleData): Crossword => {
  const letters = Array.from({ length: N * N }, (_, i) => (isBlock(p, i) ? '#' : ''))
  return { puzzleId: p.id, letters, cursor: letters.findIndex(l => l !== '#'), dir: 'across', isSolved: false }
}

export const entryAt = (p: PuzzleData, s: Pick<Crossword, 'cursor' | 'dir'>): Entry | undefined => {
  const { entries } = layout(p)
  return (
    entries.find(e => e.dir === s.dir && e.cells.includes(s.cursor)) ??
    entries.find(e => e.cells.includes(s.cursor))
  )
}

const checkSolved = (p: PuzzleData, s: Crossword): Crossword => ({
  ...s,
  isSolved: s.letters.every((l, i) => l === '#' || l === solution(p, i)),
})

export const typeLetter = (p: PuzzleData, s: Crossword, letter: string): Crossword => {
  if (s.isSolved || !/^[a-zA-Z]$/.test(letter) || isBlock(p, s.cursor)) return s
  const letters = [...s.letters]
  letters[s.cursor] = letter.toUpperCase()
  const entry = entryAt(p, s)
  const at = entry ? entry.cells.indexOf(s.cursor) : -1
  const cursor = entry && at >= 0 && at < entry.cells.length - 1 ? entry.cells[at + 1]! : s.cursor
  return checkSolved(p, { ...s, letters, cursor, dir: entry?.dir ?? s.dir })
}

export const erase = (p: PuzzleData, s: Crossword): Crossword => {
  if (s.isSolved) return s
  const letters = [...s.letters]
  if (letters[s.cursor] !== '') {
    letters[s.cursor] = ''
    return { ...s, letters }
  }
  const entry = entryAt(p, s)
  const at = entry ? entry.cells.indexOf(s.cursor) : -1
  if (!entry || at <= 0) return s
  const prev = entry.cells[at - 1]!
  letters[prev] = ''
  return { ...s, letters, cursor: prev }
}

export const moveCursor = (p: PuzzleData, s: Crossword, dir: 'up' | 'down' | 'left' | 'right'): Crossword => {
  const wantDir: Direction = dir === 'left' || dir === 'right' ? 'across' : 'down'
  // First press in a new axis just turns the cursor, as most crossword apps do.
  if (s.dir !== wantDir && entryAt(p, { cursor: s.cursor, dir: wantDir })?.dir === wantDir) return { ...s, dir: wantDir }
  const dr = dir === 'down' ? 1 : dir === 'up' ? -1 : 0
  const dc = dir === 'right' ? 1 : dir === 'left' ? -1 : 0
  let r = Math.floor(s.cursor / N) + dr
  let c = (s.cursor % N) + dc
  while (r >= 0 && r < N && c >= 0 && c < N) {
    if (!isBlock(p, r * N + c)) return { ...s, cursor: r * N + c }
    r += dr
    c += dc
  }
  return s
}

export const toggleDir = (p: PuzzleData, s: Crossword): Crossword => {
  const other: Direction = s.dir === 'across' ? 'down' : 'across'
  return entryAt(p, { cursor: s.cursor, dir: other })?.dir === other ? { ...s, dir: other } : s
}

export const select = (p: PuzzleData, s: Crossword, i: number): Crossword =>
  isBlock(p, i) ? s : i === s.cursor ? toggleDir(p, s) : { ...s, cursor: i }

/** The next puzzle to play: the first not yet solved, else the first. */
export const nextPuzzle = (all: readonly PuzzleData[], solved: readonly string[], after?: string): PuzzleData | undefined => {
  const start = after === undefined ? 0 : all.findIndex(p => p.id === after) + 1
  const order = [...all.slice(start), ...all.slice(0, start)]
  return order.find(p => !solved.includes(p.id))
}
