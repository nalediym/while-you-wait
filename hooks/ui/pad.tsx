// The input layer: an invisible Client laid over the handheld drawing. A
// click on it gives it the keyboard; it forwards keys as they are and turns
// a click into a Press (a square, a menu row, a D-pad arm, A, B, ...) by
// mapping the pointer's cell back onto the drawing's own coordinates.

import type { ClientModule, ClientPointerEvent } from 'claude-code'
import { DEVICE_H, DEVICE_W, pressAt } from './hit'
import type { HitMap, Press } from './hit'

export type PadProps = { hit: HitMap }
/** Where a click landed, raw: what the click log keeps to diagnose a tap that lands wrong. */
export type PadRaw = { x: number; y: number; fx: number | null; fy: number | null; columns: number; rows: number }

export type PadPost =
  | { type: 'key'; key: string; ctrl?: true; meta?: true }
  | { type: 'press'; press: Press | null; button: 'left' | 'right'; raw: PadRaw }

// Listeners are set once, on the first call; each call refreshes what they
// read here, so a new screen's hit map is used at once (no remount, so the
// keyboard focus survives a change of screen).
let latest: { hit: HitMap; columns: number; rows: number } | undefined

/** The pointer's position as device units, using sub-cell precision when the surface has it. */
export const toDevice = (p: Pick<ClientPointerEvent, 'x' | 'y' | 'fine'>, columns: number, rows: number) => ({
  x: (((p.fine?.x ?? p.x + 0.5) / Math.max(1, columns)) * DEVICE_W),
  y: (((p.fine?.y ?? p.y + 0.5) / Math.max(1, rows)) * DEVICE_H),
})

const Pad: ClientModule<PadProps, { isListening: true }> = (props, surface) => {
  latest = { hit: props.hit, columns: surface.columns, rows: surface.rows }
  if (surface.state === undefined) {
    surface.onKey(k => {
      const post: PadPost = { type: 'key', key: k.key, ...(k.ctrl ? { ctrl: true } : {}), ...(k.meta ? { meta: true } : {}) }
      surface.post(post)
    })
    surface.onPointer(p => {
      if (p.type !== 'down' || !latest) return
      const columns = surface.columns || latest.columns
      const rows = surface.rows || latest.rows
      const { x, y } = toDevice(p, columns, rows)
      const raw: PadRaw = { x: p.x, y: p.y, fx: p.fine?.x ?? null, fy: p.fine?.y ?? null, columns, rows }
      // Every click is posted, even one that lands on nothing, so the log shows it.
      surface.post({ type: 'press', press: pressAt(latest.hit, x, y), button: p.button === 'right' ? 'right' : 'left', raw } satisfies PadPost)
    })
    surface.setState({ isListening: true })
  }
  const { Box } = surface.elements
  return <Box width="100%" height="100%" />
}

export default Pad
