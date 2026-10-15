// Where things are on the handheld, and what a press at a point means. Kept
// apart from the drawing so the input layer (screen.tsx) stays tiny. All
// coordinates are device units (the SVG's viewBox); grid and menu are LCD units.

export const DEVICE_W = 200
export const DEVICE_H = 288
export const LCD = { x: 24, y: 22, w: 160, h: 144 } as const
export const HEADER_H = 11

export type Rect = { x: number; y: number; w: number; h: number }
export type Circle = { cx: number; cy: number; r: number }

export type HitMap = {
  lcd: Rect
  grid: { x0: number; y0: number; pitchX: number; pitchY: number; cols: number; rows: number } | null
  menu: { y0: number; pitch: number; count: number } | null
  hasHeader: boolean
  dpad: Circle
  a: Circle
  b: Circle
  select: Rect
  start: Rect
}

export const CONTROLS: Omit<HitMap, 'grid' | 'menu' | 'hasHeader'> = {
  lcd: LCD,
  dpad: { cx: 46, cy: 222, r: 24 },
  a: { cx: 168, cy: 212, r: 14 },
  b: { cx: 138, cy: 226, r: 14 },
  select: { x: 64, y: 250, w: 34, h: 26 },
  start: { x: 102, y: 250, w: 34, h: 26 },
}

export type Press =
  | { kind: 'cell'; col: number; row: number }
  | { kind: 'row'; index: number }
  | { kind: 'dir'; dir: 'up' | 'down' | 'left' | 'right' }
  | { kind: 'a' | 'b' | 'select' | 'start' | 'header' | 'lcd' }

const inCircle = (c: Circle, x: number, y: number) => (x - c.cx) ** 2 + (y - c.cy) ** 2 <= c.r ** 2
const inRect = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h

/** What a press at device point (x, y) means, or null for the bare case. */
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
  if (inCircle(hit.dpad, x, y)) {
    const dx = x - hit.dpad.cx
    const dy = y - hit.dpad.cy
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return null
    return { kind: 'dir', dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up' }
  }
  if (inCircle(hit.a, x, y)) return { kind: 'a' }
  if (inCircle(hit.b, x, y)) return { kind: 'b' }
  if (inRect(hit.select, x, y)) return { kind: 'select' }
  if (inRect(hit.start, x, y)) return { kind: 'start' }
  return null
}
