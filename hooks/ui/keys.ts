// A key pressed on the LCD -> an arcade input, per screen. Surface-agnostic:
// the terminal surface in v2 maps its keys through the same table.

import type { Input, Screen } from '../model'

const ARROWS: Record<string, 'up' | 'down' | 'left' | 'right'> = { up: 'up', down: 'down', left: 'left', right: 'right' }
const WASD: Record<string, 'up' | 'down' | 'left' | 'right'> = { w: 'up', s: 'down', a: 'left', d: 'right' }

export const keyToInput = (screen: Screen, raw: string): Input | undefined => {
  const key = raw.length === 1 ? raw.toLowerCase() : raw
  const arrow = ARROWS[key]
  if (screen === 'crossword') {
    if (arrow) return { kind: 'dir', dir: arrow }
    if (/^[a-z]$/.test(key)) return { kind: 'letter', ch: key }
    if (key === 'backspace' || key === 'delete') return { kind: 'erase' }
    if (key === 'return' || key === ' ' || key === 'space' || key === 'tab') return { kind: 'a' }
    return undefined
  }
  const dir = arrow ?? WASD[key]
  if (dir) return { kind: 'dir', dir }
  if (key === 'return' || key === ' ' || key === 'space' || key === 'z') return { kind: 'a' }
  if (key === 'x' || key === 'f' || key === 'backspace') return { kind: 'b' }
  if (key === 'n') return { kind: 'start' }
  if (key === 'm') return { kind: 'select' }
  return undefined
}
