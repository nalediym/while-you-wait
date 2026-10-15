#!/usr/bin/env bun
// Dev tool: renders the handheld SVG for every screen into one page, straight
// from the pure drawing code (no engine). An SVG draws the same in a browser
// as in the desktop app's Svg element, so this is an exact preview.
//   bun scripts/preview/devices.ts [out.html]
import { writeFileSync } from 'node:fs'
import * as G2048 from '../../hooks/games/g2048'
import * as Mines from '../../hooks/games/minesweeper'
import * as Cw from '../../hooks/games/crossword'
import { PUZZLES } from '../../hooks/games/puzzles'
import * as M from '../../hooks/model'
import { drawDevice } from '../../hooks/ui/device'

const T0 = new Date(2026, 9, 15, 15, 30).getTime()
const save: M.Save = {
  ...M.freshSave(),
  scores: { best2048Tile: 512, best2048Score: 6140, minesFastestMs: [72_000, 95_000], crosswordsSolved: ['cw-001', 'cw-002', 'cw-003'] },
}
const session: M.SessionStats = { ...M.freshSession(), turns: 13, turnsWhileWaited: 5, workMs: 4_380_000, toolCalls: 342, filesEdited: 27, boardsCleared: 6 }
const working = M.turnStarted(M.freshLive(), 't', T0)
const idle = M.freshLive()

let g = { ...G2048.newGame(7), board: [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 0, 4, 2, 0, 0], score: 18432 }
let m = Mines.reveal(Mines.newGame(11), 40, T0)
m = Mines.toggleFlag(m, 0)
m = { ...Mines.moveCursor(m, 'up'), elapsedMs: 42_000 }
const p = PUZZLES[0]!
let c = Cw.newGame(p)
for (const ch of 'CU') c = Cw.typeLetter(p, c, ch)

const states: [string, M.Save, M.Live][] = [
  ['resting', save, idle],
  ['done', save, { ...idle, banner: 'done' }],
  ['menu', { ...save, screen: 'menu', menuCursor: 1, g2048: g }, working],
  ['2048', { ...save, screen: '2048', g2048: g }, working],
  ['2048 over', { ...save, screen: '2048', g2048: { ...g, isOver: true } }, working],
  ['mines', { ...save, screen: 'mines', mines: m, flagMode: true }, working],
  ['mines won', { ...save, screen: 'mines', mines: { ...m, status: 'won' } }, working],
  ['crossword', { ...save, screen: 'crossword', crossword: c }, working],
  ['scores', { ...save, screen: 'scores' }, working],
  ['needs you', { ...save, screen: '2048', g2048: g }, { ...working, phase: 'attention', banner: 'needs-you' }],
  ['menu + 2 agents', { ...save, screen: 'menu' }, { ...working, isTurnRunning: false, agents: 2 }],
  ['mines + 3 agents', { ...save, screen: 'mines', mines: m, flagMode: true }, { ...working, agents: 3 }],
  ['xword + 1 agent', { ...save, screen: 'crossword', crossword: c }, { ...working, agents: 1 }],
  ['test mode (idle)', { ...save, screen: '2048', g2048: g }, { ...idle, testMode: true }],
]
const out = process.argv[2] ?? '.preview/devices.html'
const cards = states.map(([name, s, live]) => {
  const { svg } = drawDevice({ save: s, live, session, now: T0 + 42_000, puzzles: PUZZLES })
  return `<figure><figcaption>${name} · ${(svg.length / 1024).toFixed(1)} KB</figcaption>${svg.replace(/width="\d+" height="\d+"/, 'width="300"')}</figure>`
})
writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>while-you-wait devices</title><style>body{margin:0;padding:20px;background:#1e1e22;font:12px system-ui;color:#999;display:flex;flex-wrap:wrap;gap:24px}figure{margin:0}figcaption{margin-bottom:6px}</style>${cards.join('')}`)
console.log(`${states.length} devices -> ${out}`)
