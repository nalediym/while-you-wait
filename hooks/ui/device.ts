// The handheld's screen half, drawn as one SVG: an off-white case, the dark
// bezel with its WHILE-YOU-WAIT label and power LED, and a 160x144 LCD in the
// four DMG greens. The controls are real buttons under it (pane.tsx), since
// the desktop delivers no clicks to a drawing. Pure: state in, `{ svg }` out.

import * as Mines from '../games/minesweeper'
import { entryAt, layout } from '../games/crossword'
import type { PuzzleData } from '../games/puzzles'
import type { Live, Save, SessionStats } from '../model'
import { GAMES, MENU, fmtClock, fmtDuration } from '../model'
import { GB } from './palette'
import { Typesetter, normalize, textWidth, wrap } from './pixelfont'

// Device units: the SVG's viewBox. The LCD is the DMG's 160x144.
export const DEVICE_W = 200
export const DEVICE_H = 192
export const LCD = { x: 24, y: 22, w: 160, h: 144 } as const

const CASE = '#d6d2c8'
const CASE_EDGE = '#b3aea3'
const BEZEL = '#56586b'
const INK = '#2c3178' // the navy of the printed labels
const MAROON = '#9a2257'

export type DeviceView = { save: Save; live: Live; session: SessionStats; now: number; puzzles: readonly PuzzleData[] }

const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`

const centerX = (s: string, scale = 1, width = LCD.w) => Math.round((width - textWidth(s, scale)) / 2)

// ── LCD screens (160x144, LCD units) ────────────────────────────────────

/** `✦2` when agents are working: the count rides along in every screen's header. */
const agentsTag = (v: DeviceView) => (v.live.agents > 0 ? ` ✦${v.live.agents}` : '')

const header = (t: Typesetter, left: string, right: string) =>
  rect(0, 0, LCD.w, 11, GB.darkest) + t.text(left, 3, 2, GB.lightest) + t.text(right, LCD.w - 2 - textWidth(right), 2, GB.light)

const statRow = (t: Typesetter, label: string, value: string, y: number, color: string = GB.darkest) =>
  t.text(label, 6, y, color) + t.text(value, 154 - textWidth(value), y, GB.darkest)

const resting = (t: Typesetter, v: DeviceView): string => {
  const today = v.session
  let s = ''
  if (v.live.banner === 'done') {
    s += rect(0, 0, LCD.w, 13, GB.darkest) + t.text("✓ CLAUDE'S DONE!", centerX("✓ CLAUDE'S DONE!"), 3, GB.lightest)
  }
  // A sleepy little sparkle, Z's drifting up.
  s += t.text("CLAUDE'S", centerX("CLAUDE'S", 2), 20, GB.darkest, 2)
  s += t.text('RESTING', centerX('RESTING', 2), 38, GB.darkest, 2)
  s += t.text('✦', 128, 42, GB.dark, 2) + t.text('Z', 141, 34, GB.dark) + t.text('Z', 147, 27, GB.light)
  s += t.text('GO SHIP SOMETHING ✦', centerX('GO SHIP SOMETHING ✦'), 60, GB.dark)
  s += rect(4, 74, 152, 66, GB.light)
  s += t.text('THIS SESSION', 6, 77, GB.darkest)
  s += rect(6, 86, 148, 1, GB.dark)
  s += statRow(t, 'TASKS SHIPPED', String(today.turns), 90)
  s += statRow(t, 'CLAUDE WORKED', fmtDuration(today.workMs).toUpperCase(), 100)
  s += statRow(t, 'TOOL CALLS', String(today.toolCalls), 110)
  s += statRow(t, 'FILES EDITED', String(today.filesEdited), 120)
  s += statRow(t, 'BOARDS CLEARED', String(today.boardsCleared), 130, GB.dark)
  return s
}

const ICONS: Record<string, (x: number, y: number) => string> = {
  '2048': (x, y) => rect(x, y, 7, 7, GB.dark) + rect(x + 8, y, 7, 7, GB.darkest) + rect(x, y + 8, 7, 7, GB.darkest) + rect(x + 8, y + 8, 7, 7, GB.light),
  mines: (x, y) =>
    rect(x + 4, y + 3, 8, 10, GB.darkest) + rect(x + 3, y + 4, 10, 8, GB.darkest) + rect(x + 7, y, 2, 16, GB.darkest) + rect(x, y + 7, 16, 2, GB.darkest) + rect(x + 5, y + 5, 2, 2, GB.lightest),
  crossword: (x, y) => {
    let s = rect(x, y, 16, 16, GB.darkest)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!(r === 1 && c === 1)) s += rect(x + 1 + c * 5, y + 1 + r * 5, 4, 4, GB.lightest)
    return s
  },
  scores: (x, y) => rect(x + 1, y + 9, 4, 7, GB.dark) + rect(x + 6, y + 4, 4, 12, GB.darkest) + rect(x + 11, y + 1, 4, 15, GB.dark),
}

const menu = (t: Typesetter, v: DeviceView): string => {
  const y0 = 16
  const pitch = 28
  let s = header(t, 'SELECT GAME', v.live.agents > 0 ? `✦${v.live.agents} AGENT${v.live.agents === 1 ? '' : 'S'}` : '')
  MENU.forEach((screen, i) => {
    const y = y0 + i * pitch
    const game = GAMES.find(g => g.id === screen)
    const isCursor = i === v.save.menuCursor
    const hasSave = (screen === '2048' && v.save.g2048) || (screen === 'mines' && v.save.mines) || (screen === 'crossword' && v.save.crossword)
    if (isCursor) s += rect(0, y, LCD.w, pitch - 2, GB.light) + t.text('▶', 3, y + 9, GB.darkest)
    s += ICONS[screen]!(14, y + 5)
    s += t.text(game?.name ?? 'SCORES', 38, y + 5, GB.darkest)
    s += t.text(game ? (hasSave ? 'CONTINUE ▶' : game.blurb) : 'STATS & BESTS', 38, y + 15, GB.dark)
  })
  return s
}

const tileStyle = (v: number): { bg: string; fg: string; ring?: string } => {
  if (v === 0) return { bg: GB.light, fg: GB.light }
  if (v <= 4) return { bg: GB.lightest, fg: GB.darkest }
  if (v <= 64) return { bg: GB.dark, fg: GB.lightest }
  return { bg: GB.darkest, fg: GB.lightest, ring: GB.light }
}

const overlayBox = (t: Typesetter, lines: string[], y = 54) => {
  const h = lines.length * 11 + 9
  let s = rect(8, y, 144, h, GB.darkest) + rect(10, y + 2, 140, h - 4, 'none', ` stroke="${GB.light}" stroke-width="1"`)
  lines.forEach((line, i) => (s += t.text(line, centerX(line), y + 6 + i * 11, i === 0 ? GB.lightest : GB.light)))
  return s
}

const g2048 = (t: Typesetter, v: DeviceView): string => {
  const g = v.save.g2048!
  const x0 = 17
  const y0 = 15
  const tile = 30
  let s = header(t, `2048${agentsTag(v)}`, `SCORE ${g.score}`) + rect(x0 - 2, y0 - 2, 4 * tile + 3 * 2 + 4, 4 * tile + 3 * 2 + 4, GB.darkest)
  g.board.forEach((val, i) => {
    const x = x0 + (i % 4) * (tile + 2)
    const y = y0 + Math.floor(i / 4) * (tile + 2)
    const st = tileStyle(val)
    s += rect(x, y, tile, tile, st.bg)
    if (st.ring) s += rect(x + 2, y + 2, tile - 4, tile - 4, 'none', ` stroke="${st.ring}" stroke-width="1"`)
    if (val === 0) s += rect(x + 14, y + 14, 2, 2, GB.dark)
    else {
      const label = String(val)
      const scale = label.length <= 2 ? 2 : 1
      const w = textWidth(label, scale)
      s += t.text(label, x + Math.round((tile - w) / 2), y + Math.round((tile - 7 * scale) / 2), st.fg, scale)
    }
  })
  if (g.isOver) s += overlayBox(t, ['NO MOVES LEFT', `SCORE ${g.score}`, 'START = NEW BOARD'])
  return s
}

const mines = (t: Typesetter, v: DeviceView): string => {
  const m = v.save.mines!
  const pitch = 14
  const cell = 13
  const x0 = 17
  const y0 = 14
  const right = `⚑${Mines.flagsLeft(m)} ${fmtClock(Mines.elapsed(m, v.now))}`
  const left = `MINES${agentsTag(v)}`
  let s = header(t, left, right)
  // The FLAG chip: lit while clicks plant flags. Clicking the header toggles it.
  const fx = 3 + textWidth(left) + 7
  s += v.save.flagMode ? rect(fx - 2, 1, 29, 9, GB.lightest) + t.text('FLAG', fx, 2, GB.darkest) : t.text('FLAG', fx, 2, GB.dark)
  m.revealed.forEach((open, i) => {
    const x = x0 + (i % m.w) * pitch
    const y = y0 + Math.floor(i / m.w) * pitch
    const isMine = m.mines.includes(i)
    if (m.exploded === i) s += rect(x, y, cell, cell, GB.darkest) + t.text('●', x + 4, y + 3, GB.lightest)
    else if (open && isMine) s += rect(x, y, cell, cell, GB.light) + t.text('●', x + 4, y + 3, GB.darkest)
    else if (open) {
      s += rect(x, y, cell, cell, GB.lightest)
      const n = Mines.adjacentMines(m, i)
      if (n > 0) s += t.text(String(n), x + 4, y + 3, n === 1 ? GB.dark : GB.darkest)
    } else {
      // A raised tile: light top-left edge, darkest bottom-right.
      s += rect(x, y, cell, cell, GB.dark) + rect(x, y, cell, 1, GB.light) + rect(x, y, 1, cell, GB.light) + rect(x, y + cell - 1, cell, 1, GB.darkest) + rect(x + cell - 1, y, 1, cell, GB.darkest)
      if (m.flagged[i]) s += t.text('⚑', x + 4, y + 3, GB.lightest)
    }
    const isActive = m.status === 'ready' || m.status === 'playing'
    if (i === m.cursor && isActive) s += rect(x - 1, y - 1, cell + 2, cell + 2, 'none', ` stroke="${GB.darkest}" stroke-width="2"`)
  })
  if (m.status === 'won') s += overlayBox(t, ['CLEARED! ✦', `TIME ${fmtClock(Mines.elapsed(m, v.now))}`, 'START = NEW BOARD'])
  if (m.status === 'lost') s += overlayBox(t, ['BOOM!', 'START = NEW BOARD'])
  return s
}

const crossword = (t: Typesetter, v: DeviceView): string => {
  const c = v.save.crossword
  const p = v.puzzles.find(q => q.id === c?.puzzleId)
  if (!c || !p) return t.text('NO PUZZLES', 50, 66, GB.darkest)
  const pitch = 21
  const cell = 20
  const x0 = 28
  const y0 = 4
  const { numbers } = layout(p)
  const entry = entryAt(p, c)
  const word = new Set(entry?.cells ?? [])
  let s = rect(x0 - 2, y0 - 2, 5 * pitch + 3, 5 * pitch + 3, GB.darkest)
  c.letters.forEach((l, i) => {
    const x = x0 + (i % 5) * pitch
    const y = y0 + Math.floor(i / 5) * pitch
    if (l === '#') return
    const isCursor = i === c.cursor && !c.isSolved
    const bg = isCursor ? GB.dark : word.has(i) && !c.isSolved ? GB.light : GB.lightest
    const fg = isCursor ? GB.lightest : GB.darkest
    s += rect(x, y, cell, cell, bg)
    const num = numbers[i]
    if (num !== null && num !== undefined) s += t.digits(String(num), x + 1, y + 1, fg)
    if (l) s += t.text(l, x + 6, y + 6, fg, 2)
  })
  if (v.live.agents > 0) s += rect(137, 2, 21, 11, GB.darkest) + t.text(`✦${v.live.agents}`, 140, 4, GB.lightest)
  s += rect(0, 112, LCD.w, 32, GB.darkest)
  if (c.isSolved) {
    s += t.text('SOLVED! ✦', centerX('SOLVED! ✦'), 117, GB.lightest) + t.text('START = NEXT PUZZLE', centerX('START = NEXT PUZZLE'), 129, GB.light)
  } else if (entry) {
    const tag = `${entry.num}${entry.dir === 'across' ? 'A' : 'D'}`
    const lines = wrap(`${tag} ${p.clues[entry.dir][String(entry.num)] ?? ''}`, 25).slice(0, 3)
    lines.forEach((line, i) => {
      if (i === 0) s += t.text(tag, 4, 115, GB.lightest) + t.text(line.slice(tag.length), 4 + tag.length * 6, 115, GB.light)
      else s += t.text(line, 4, 115 + i * 9, GB.light)
    })
  }
  return s
}

const scores = (t: Typesetter, v: DeviceView): string => {
  const sc = v.save.scores
  const all = v.session
  let s = header(t, `SCORES${agentsTag(v)}`, 'B = BACK')
  s += t.text('CLAUDE, THIS SESSION', 6, 16, GB.darkest)
  s += statRow(t, 'TASKS SHIPPED', String(all.turns), 27)
  s += statRow(t, 'TIME WORKED', fmtDuration(all.workMs).toUpperCase(), 36)
  s += statRow(t, 'TOOL CALLS', String(all.toolCalls), 45)
  s += statRow(t, 'FILES EDITED', String(all.filesEdited), 54)
  s += statRow(t, 'WHILE YOU WAITED', String(all.turnsWhileWaited), 63)
  s += rect(6, 76, 148, 1, GB.dark)
  s += t.text('YOUR BESTS', 6, 82, GB.dark)
  s += statRow(t, '2048 TILE', sc.best2048Tile ? String(sc.best2048Tile) : '-', 93, GB.dark)
  s += statRow(t, '2048 SCORE', sc.best2048Score ? String(sc.best2048Score) : '-', 102, GB.dark)
  s += statRow(t, 'MINES', sc.minesFastestMs[0] !== undefined ? fmtClock(sc.minesFastestMs[0]) : '-', 111, GB.dark)
  s += statRow(t, 'CROSSWORDS', `${sc.crosswordsSolved.length}/${v.puzzles.length}`, 120, GB.dark)
  s += statRow(t, 'BOARDS CLEARED', String(all.boardsCleared), 129, GB.dark)
  return s
}

const screenFor = (t: Typesetter, v: DeviceView): string => {
  if (v.live.phase === 'idle' && !v.live.testMode) return resting(t, v)
  const { save } = v
  if (save.screen === '2048' && save.g2048) return g2048(t, v)
  if (save.screen === 'mines' && save.mines) return mines(t, v)
  if (save.screen === 'crossword') return crossword(t, v)
  if (save.screen === 'scores') return scores(t, v)
  return menu(t, v)
}

/** Claude needs you: the screen behind is dithered out, a box on top. */
const attention = (t: Typesetter) =>
  `<rect width="${LCD.w}" height="${LCD.h}" fill="url(#dither)"/>` +
  overlayBox(t, ['CLAUDE NEEDS YOU!', 'GAME PAUSED & SAVED', '↩ GO ANSWER CLAUDE'], 48)

// ── The case ────────────────────────────────────────────────────────────

/** A rect with its own radius on the bottom-right corner, like the DMG. */
const dmgShape = (x: number, y: number, w: number, h: number, r: number, br: number, fill: string, extra = '') =>
  `<path d="M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - r - br}a${br} ${br} 0 0 1 -${br} ${br}h-${w - r - br}a${r} ${r} 0 0 1 -${r} -${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}z" fill="${fill}"${extra}/>`

const ledColor = (live: Live) => (live.phase === 'working' ? '#ff4d5e' : live.phase === 'attention' ? '#ffb000' : '#5b2d36')

export const drawDevice = (v: DeviceView): { svg: string } => {
  const t = new Typesetter()
  const lcdBody = screenFor(t, v) + (v.live.phase === 'attention' ? attention(t) : '')
  const label = 'WHILE-YOU-WAIT'
  const lw = textWidth(label)
  const lx = Math.round((DEVICE_W - lw) / 2)
  const isOn = v.live.phase !== 'idle'

  const caseLayer =
    dmgShape(1, 1, DEVICE_W - 2, DEVICE_H - 2, 10, 18, CASE, ` stroke="${CASE_EDGE}" stroke-width="1"`) +
    dmgShape(6, 6, 188, 176, 6, 26, BEZEL) +
    rect(14, 12, lx - 20, 1, MAROON) + rect(14, 15, lx - 20, 1, INK) +
    rect(lx + lw + 6, 12, DEVICE_W - 14 - (lx + lw + 6), 1, MAROON) + rect(lx + lw + 6, 15, DEVICE_W - 14 - (lx + lw + 6), 1, INK) +
    t.text(label, lx, 10, '#c9cbd6') +
    `<circle cx="15" cy="58" r="3" fill="${ledColor(v.live)}"/>` +
    (isOn ? `<circle cx="15" cy="58" r="5" fill="${ledColor(v.live)}" opacity=".25"/>` : '') +
    t.text('PWR', 6, 66, '#8d8fa0') +
    (v.live.testMode ? t.text('TEST MODE', LCD.x, 171, '#ffb000') : '')

  const lcdLayer =
    `<g transform="translate(${LCD.x} ${LCD.y})" clip-path="url(#lcdclip)">` +
    rect(0, 0, LCD.w, LCD.h, GB.lightest) + lcdBody + '</g>' +
    rect(LCD.x, LCD.y, LCD.w, 1, '#000', ' opacity=".18"') // the glass shadow

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DEVICE_W} ${DEVICE_H}" width="${DEVICE_W * 2}" height="${DEVICE_H * 2}" shape-rendering="crispEdges">` +
    `<defs>${t.defs()}<clipPath id="lcdclip"><rect width="${LCD.w}" height="${LCD.h}"/></clipPath>` +
    `<pattern id="dither" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="${GB.darkest}"/><rect x="1" y="1" width="1" height="1" fill="${GB.dark}"/></pattern></defs>` +
    caseLayer + lcdLayer + '</svg>'

  return { svg }
}

/** What the screen shows, in words: the Svg's alt text (and what tests read). */
export const svgAlt = (v: DeviceView): string => {
  const { save, live } = v
  if (live.testMode && live.phase !== 'working') return `While-you-wait, test mode: ${normalize(save.screen)} screen.`
  if (live.phase === 'idle') return `While-you-wait. Claude's resting: go ship something.${live.banner === 'done' ? " Claude's done." : ''} This session: ${v.session.turns} tasks shipped.`
  if (live.phase === 'attention') return 'While-you-wait. Paused: Claude needs you.'
  if (live.agents > 0 && !live.isTurnRunning) return `While-you-wait. ${live.agents} background agent${live.agents === 1 ? '' : 's'} working: ${normalize(save.screen)} screen.`
  switch (save.screen) {
    case 'menu': return `While-you-wait. Select game: ${normalize(MENU[save.menuCursor] ?? '')}.`
    case '2048': return save.g2048 ? `While-you-wait. 2048, score ${save.g2048.score}${save.g2048.isOver ? ', no moves left' : ''}.` : 'While-you-wait. 2048.'
    case 'mines': return save.mines ? `While-you-wait. Mines, ${save.mines.status}, ${Mines.flagsLeft(save.mines)} flags left${save.flagMode ? ', flag mode on' : ''}.` : 'While-you-wait. Mines.'
    case 'crossword': return save.crossword ? `While-you-wait. Crossword ${save.crossword.puzzleId}${save.crossword.isSolved ? ', solved' : ''}: ${save.crossword.letters.filter(l => l && l !== '#').join('')}.` : 'While-you-wait. Crossword.'
    case 'scores': return 'While-you-wait. Scores.'
  }
}
