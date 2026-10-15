// Game state -> a grid of colored cells: plain data, so the same grid is
// drawn by the desktop's Client module today and by a terminal Raster or
// Box tree in v2. No surface code in here.

import type { G2048 } from '../games/g2048'
import type { Mines } from '../games/minesweeper'
import { adjacentMines } from '../games/minesweeper'
import type { Crossword } from '../games/crossword'
import { entryAt, layout, N } from '../games/crossword'
import type { PuzzleData } from '../games/puzzles'
import { GB } from './palette'

export type Cell = { t: string; fg: string; bg: string; bold?: boolean; sup?: string }

/** `cw`×`ch` cells per square; `gapX` columns and `gapY` rows of `line` color between squares. */
export type Grid = { cols: number; cw: number; ch: number; gapX: number; gapY: number; line: string; cells: Cell[] }

export const gridWidth = (g: Grid): number => g.cols * g.cw + (g.cols - 1) * g.gapX
export const gridHeight = (g: Grid): number => {
  const rows = Math.ceil(g.cells.length / g.cols)
  return rows * g.ch + (rows - 1) * g.gapY
}

/** Which square a pointer at region cell (x, y) is on, or null in a gap. */
export const hitTest = (g: Grid, x: number, y: number): { col: number; row: number } | null => {
  const sx = g.cw + g.gapX
  const sy = g.ch + g.gapY
  const col = Math.floor(x / sx)
  const row = Math.floor(y / sy)
  if (x - col * sx >= g.cw || y - row * sy >= g.ch) return null
  if (col < 0 || col >= g.cols || row < 0 || row >= Math.ceil(g.cells.length / g.cols)) return null
  return { col, row }
}

export const grid2048 = (g: G2048): Grid => ({
  cols: 4, cw: 6, ch: 3, gapX: 1, gapY: 1, line: GB.darkest,
  cells: g.board.map(v => {
    if (v === 0) return { t: '·', fg: GB.dark, bg: GB.light }
    if (v <= 4) return { t: String(v), fg: GB.darkest, bg: GB.lightest, bold: true }
    if (v <= 64) return { t: String(v), fg: GB.lightest, bg: GB.dark, bold: true }
    return { t: String(v), fg: GB.lightest, bg: GB.darkest, bold: true }
  }),
})

export const gridMines = (m: Mines, isPaused: boolean): Grid => ({
  cols: m.w, cw: 2, ch: 1, gapX: 1, gapY: 0, line: GB.light,
  cells: m.revealed.map((open, i) => {
    const isCursor = i === m.cursor && !isPaused && (m.status === 'ready' || m.status === 'playing')
    let cell: Cell
    if (m.exploded === i) cell = { t: '✕', fg: GB.lightest, bg: GB.darkest, bold: true }
    else if (open && m.mines.includes(i)) cell = { t: '●', fg: GB.darkest, bg: GB.light }
    else if (open) {
      const n = adjacentMines(m, i)
      cell = { t: n === 0 ? '' : String(n), fg: n >= 3 ? GB.darkest : GB.dark, bg: GB.lightest, bold: n > 0 }
    } else if (m.flagged[i]) cell = { t: '▲', fg: GB.lightest, bg: GB.dark, bold: true }
    else cell = { t: '', fg: GB.light, bg: GB.dark }
    return isCursor ? { ...cell, fg: GB.lightest, bg: GB.darkest, t: cell.t || '·' } : cell
  }),
})

export const gridCrossword = (p: PuzzleData, c: Crossword, isPaused: boolean): Grid => {
  const { numbers } = layout(p)
  const word = new Set(entryAt(p, c)?.cells ?? [])
  return {
    cols: N, cw: 4, ch: 2, gapX: 1, gapY: 1, line: GB.darkest,
    cells: c.letters.map((l, i) => {
      if (l === '#') return { t: '', fg: GB.darkest, bg: GB.darkest }
      // No `undefined` fields: a Client's props must be plain JSON.
      const num = numbers[i]
      const base = { t: l, bold: true, ...(num === null || num === undefined ? {} : { sup: String(num) }) }
      if (c.isSolved) return { ...base, fg: GB.darkest, bg: GB.lightest }
      if (i === c.cursor && !isPaused) return { ...base, fg: GB.lightest, bg: GB.dark }
      if (word.has(i) && !isPaused) return { ...base, fg: GB.darkest, bg: GB.light }
      return { ...base, fg: GB.darkest, bg: GB.lightest }
    }),
  }
}
