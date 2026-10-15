// The arcade's LCD on the desktop: a Client region that draws the current
// game's grid and, once clicked, takes the keyboard. It only forwards what
// the person did (a key, a tapped square); the hooks module owns all state.

import type { ClientModule } from 'claude-code'
import { drawGrid } from './draw-grid'
import { hitTest } from './grid'
import type { Grid } from './grid'

export type ScreenProps = { grid: Grid }
export type ScreenPost =
  | { type: 'key'; key: string; ctrl?: true; meta?: true }
  | { type: 'tap'; col: number; row: number; button: 'left' | 'right' }

// Listeners are set once, on the first call. Each game draws its own keyed
// Client, so the grid's geometry (all a tap needs) is fixed for its life.
type Local = { isListening: true }

const Screen: ClientModule<ScreenProps, Local> = (props, surface) => {
  if (surface.state === undefined) {
    surface.onKey(k => {
      const post: ScreenPost = { type: 'key', key: k.key, ...(k.ctrl ? { ctrl: true } : {}), ...(k.meta ? { meta: true } : {}) }
      surface.post(post)
    })
    const geometry = props.grid
    surface.onPointer(p => {
      if (p.type !== 'down') return
      const hit = hitTest(geometry, p.x, p.y)
      if (hit) surface.post({ type: 'tap', col: hit.col, row: hit.row, button: p.button === 'right' ? 'right' : 'left' } satisfies ScreenPost)
    })
    surface.setState({ isListening: true })
  }
  return drawGrid(surface.elements, props.grid)
}

export default Screen
