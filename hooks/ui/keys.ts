// A key -> an arcade input, per screen, and what the keyboard-mode field's
// text means as keys. Surface-agnostic: a terminal surface would map its keys
// through the same table.

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

/**
 * What one change to the keyboard box means: the keys typed since the last
 * change, or how many were erased. Works whether the surface clears the box
 * after each render (every change is one new key) or keeps the text (each
 * change adds to, or backspaces from, what came before).
 */
export const boxDelta = (prev: string, next: string): { typed: string; erased: number } => {
  if (next.length > prev.length) return { typed: next.startsWith(prev) ? next.slice(prev.length) : next.slice(-1), erased: 0 }
  if (next.length < prev.length) return prev.startsWith(next) ? { typed: '', erased: prev.length - next.length } : { typed: next.slice(-1), erased: 0 }
  return { typed: next.slice(-1), erased: 0 } // same length: the box was cleared, then one key typed
}

/** The inputs one change to the keyboard box makes, on this screen. */
export const boxInputs = (screen: Screen, prev: string, next: string): Input[] => {
  const { typed, erased } = boxDelta(prev, next)
  const out: Input[] = []
  for (let i = 0; i < erased; i++) out.push(screen === 'crossword' ? { kind: 'erase' } : { kind: 'b' })
  for (const ch of typed) {
    const input = ch === ' ' ? keyToInput(screen, 'space') : keyToInput(screen, ch)
    if (input) out.push(input)
  }
  return out
}
