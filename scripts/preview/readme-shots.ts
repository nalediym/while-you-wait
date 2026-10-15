#!/usr/bin/env bun
// Writes the README's handheld images (docs/*.svg) from the real drawing code.
import { writeFileSync } from 'node:fs'
import * as G2048 from '../../hooks/games/g2048'
import * as Mines from '../../hooks/games/minesweeper'
import * as Cw from '../../hooks/games/crossword'
import { PUZZLES } from '../../hooks/games/puzzles'
import * as M from '../../hooks/model'
import { DEVICE_H, DEVICE_W, drawDevice } from '../../hooks/ui/device'

const T0 = new Date(2026, 9, 15, 15, 30).getTime()
const save: M.Save = M.freshSave()
const session: M.SessionStats = { ...M.freshSession(), turns: 14, turnsWhileWaited: 6, workMs: 4_380_000, toolCalls: 342, filesEdited: 27, boardsCleared: 6 }
const working = M.turnStarted(M.freshLive(), 't', T0)
const g = { ...G2048.newGame(7), board: [2, 4, 8, 16, 0, 64, 128, 4, 0, 2, 256, 32, 0, 0, 2, 512], score: 6140 }
let m = Mines.reveal(Mines.newGame(11), 40, T0)
m = { ...Mines.toggleFlag(m, m.revealed.findIndex(o => !o)), elapsedMs: 42_000 }
const p = PUZZLES[0]!
let c = Cw.newGame(p)
for (const ch of 'CU') c = Cw.typeLetter(p, c, ch)
const shots: [string, M.Save, M.Live][] = [
  ['resting', save, { ...M.freshLive(), banner: 'done' }],
  ['2048', { ...save, screen: '2048', g2048: g }, working],
  ['mines', { ...save, screen: 'mines', mines: m }, working],
  ['crossword', { ...save, screen: 'crossword', crossword: c }, working],
]
for (const [name, s, live] of shots) {
  const { svg } = drawDevice({ save: s, live, session, now: T0 + 42_000, puzzles: PUZZLES })
  // Sized from the device's own aspect, so the image has no empty band above or below.
  writeFileSync(`docs/${name}.svg`, svg.replace(/width="\d+" height="\d+"/, `width="300" height="${Math.round((300 * DEVICE_H) / DEVICE_W)}"`))
}
console.log(`${shots.length} images -> docs/`)
