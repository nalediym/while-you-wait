// Where things are on the handheld's screen, and what a tap at a point means.
// Kept apart from the drawing so the input layer (pad.tsx) stays tiny. All
// coordinates are device units (the SVG's viewBox); grid and menu are LCD units.
// The controls are real buttons under the drawing (pane.tsx), not drawn.

export const DEVICE_W = 200
export const DEVICE_H = 192
export const LCD = { x: 24, y: 22, w: 160, h: 144 } as const
export const HEADER_H = 11

export type Rect = { x: number; y: number; w: number; h: number }

export type HitMap = {
  lcd: Rect
  grid: { x0: number; y0: number; pitchX: number; pitchY: number; cols: number; rows: number } | null
  menu: { y0: number; pitch: number; count: number } | null
  hasHeader: boolean
}

export type Press =
  | { kind: 'cell'; col: number; row: number }
  | { kind: 'row'; index: number }
  | { kind: 'header' | 'lcd' }

const inRect = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h

/** What a tap at device point (x, y) means, or null off the screen. */
export const pressAt = (hit: HitMap, x: number, y: number): Press | null => {
  if (inRect(hit.lcd, x, y)) {
    const lx = x - hit.lcd.x
    const ly = y - hit.lcd.y
    if (hit.hasHeader && ly < HEADER_H) return { kind: 'header' }
    const g = hit.grid
    if (g) {
      const col = Math.floor((lx - g.x0) / g.pitchX)
      const row = Math.floor((ly - g.y0) / g.pitchY)
      if (col >= 0 && col < g.cols && row >= 0 && row < g.rows) return { kind: 'cell', col, row }
    }
    const m = hit.menu
    if (m) {
      const index = Math.floor((ly - m.y0) / m.pitch)
      if (index >= 0 && index < m.count) return { kind: 'row', index }
    }
    return { kind: 'lcd' }
  }
  return null
}
