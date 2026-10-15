import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { Save } from '../types'
import { DEVICE_H, DEVICE_W, LCD } from '../hooks/ui/hit'
import { harness } from './harness'

const PLUGIN = 'while-you-wait'
const T0 = Date.UTC(2026, 9, 15, 12, 0, 0)
// The pad's region in cells: 1 cell = 2 device units across, 4 down.
const COLS = DEVICE_W / 2
const ROWS = DEVICE_H / 4

const PANE_PROPS = {
  title: 'While You Wait',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { top: 0, bodyRows: 80 },
  view: {},
} as never

const mountOn = <S extends 'desktop' | 'vscode'>($: Engine, surface: S) =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'arcade', props: PANE_PROPS, viewport: { columns: 64, rows: 80, isFullscreen: true } })
const mountPane = ($: Engine) => mountOn($, 'desktop')

const startSession = ($: Engine) => $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true, startedAt: T0 } as never)
const startTurn = ($: Engine, turnId: string) => $.turn.start({ text: 'build it', turnId })
const completeTurn = ($: Engine, turnId: string) =>
  $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId, reason: 'answer' } as never)

type Ui = Awaited<ReturnType<typeof mountPane>>

const alt = async (ui: Ui) => String((await ui.find({ type: 'Svg' }))?.props.alt ?? '')

/** A real click at device point (x, y) on the input pad, as the person's pointer. */
const clickAt = async (ui: Ui, x: number, y: number, button: 'left' | 'right' = 'left') => {
  await ui.resize({ columns: COLS, rows: ROWS, in: 'pad' } as never)
  await ui.pointer({ type: 'down', x: Math.floor(x / 2), y: Math.floor(y / 4), button, in: 'pad' })
  await ui.pointer({ type: 'up', x: Math.floor(x / 2), y: Math.floor(y / 4), button, in: 'pad' })
}

describe('the handheld on desktop', () => {
  test('locked while idle, playable while working, paused + saved when Claude is done', async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)

    // Idle: the resting screen, and no controls to play with.
    expect(await alt(ui)).toMatch(/Claude's resting/)
    expect(await ui.find({ key: 'btn-a' })).toBe(undefined)

    // Claude starts working: the menu. Click the 2048 row on the LCD.
    await startTurn($, 't1')
    expect(await alt(ui)).toMatch(/Select game: 2048/)
    await clickAt(ui, LCD.x + 80, LCD.y + 16 + 10)
    expect(await alt(ui)).toMatch(/2048, score 0/)

    // The real D-pad buttons slide tiles (and keys on the screen, where they reach it).
    for (const dir of ['left', 'up', 'right', 'down']) await ui.press({ key: `pad-${dir}` })
    for (const key of ['a', 'w', 'd', 's']) await ui.key({ key, in: 'pad' })
    expect((h.store.get('save-v2') as Save).g2048!.moves).toBeGreaterThan(0)

    // A turn running 60s offers the pane, once.
    expect(h.opened).toEqual([])
    await clock.advance(61_000)
    expect(h.opened).toEqual(['arcade'])
    await clock.advance(120_000)
    expect(h.opened).toEqual(['arcade'])

    // Claude finishes: banner + jump-back button, locked, saved.
    await completeTurn($, 't1')
    expect(await alt(ui)).toMatch(/Claude's resting.*Claude's done/)
    const saved = h.store.get('save-v2') as Save
    expect(saved.screen).toBe('2048')
    expect(Object.keys(saved)).not.toContain('stats') // stats stay in this session
    expect(await alt(ui)).toMatch(/This session: 1 tasks shipped/)
    expect(await ui.find({ type: 'Text', text: /Claude shipped 1 task this session/ })).toBeDefined()
    await ui.press({ key: 'jump-back' })
    expect(h.closed).toEqual(['arcade'])
  })

  test('mines: A digs, B flags, FLAG mode makes A flag; screen taps work too', async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    await ui.press({ key: 'open-mines' })
    expect(await alt(ui)).toMatch(/Mines, ready/)
    await ui.press({ key: 'btn-a' }) // dig the centre: always safe
    expect(await alt(ui)).toMatch(/Mines, (playing|won)/)
    await ui.press({ key: 'btn-start' })
    expect(await alt(ui)).toMatch(/Mines, ready/)
    const cell = (col: number, row: number) => ({ x: LCD.x + 17 + col * 14 + 6, y: LCD.y + 14 + row * 14 + 6 })
    await clickAt(ui, cell(4, 4).x, cell(4, 4).y) // first dig is safe
    expect(await alt(ui)).toMatch(/Mines, (playing|won)/)
    const m = (h.store.get('save-v2') as Save).mines!
    const hidden = m.revealed.findIndex(open => !open)
    await clickAt(ui, cell(hidden % 9, Math.floor(hidden / 9)).x, cell(hidden % 9, Math.floor(hidden / 9)).y, 'right')
    expect(await alt(ui)).toMatch(/9 flags left/)
    await ui.press({ key: 'flag-mode' })
    expect(await alt(ui)).toMatch(/flag mode on/)
    expect((await ui.find({ key: 'btn-a' }))?.props.label).toBe('A flag')
  })

  test('a permission prompt pauses with "Claude needs you"; clicking the screen jumps back', async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    await ui.press({ key: 'pad-down' })
    await ui.press({ key: 'btn-a' }) // MINES
    await ui.press({ key: 'btn-a' }) // dig the centre
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } } as never)
    expect(await alt(ui)).toMatch(/Claude needs you/)
    expect(await ui.find({ key: 'jump-back' })).toBeDefined()
    expect((h.store.get('save-v2') as Save).mines?.runningSince).toBe(null) // the clock is banked
    await clickAt(ui, LCD.x + 80, LCD.y + 70)
    expect(h.closed).toEqual(['arcade'])
  })

  test('next session resumes your game exactly, with stats starting from zero', async ($, on) => {
    mock.clock(on, { now: T0 })
    const board = [2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1024]
    harness(on, {
      'save-v1': {
        v: 1, screen: '2048', menuCursor: 0, flagMode: false, mines: null, crossword: null,
        g2048: { board, score: 777, seed: 3, moves: 40, isOver: false, hasWon: false },
        scores: { best2048Tile: 1024, best2048Score: 777, minesFastestMs: [], crosswordsSolved: [] },
        stats: { day: '2026-10-15', today: { turns: 14, turnsWhileWaited: 6, workMs: 3_600_000, toolCalls: 300, filesEdited: 12, boardsCleared: 6 }, allTime: { turns: 99, turnsWhileWaited: 40, workMs: 36_000_000, toolCalls: 3000, filesEdited: 80, boardsCleared: 30 }, todayFiles: [] },
      },
    })
    await startSession($)
    const ui = await mountPane($)
    expect(await ui.find({ type: 'Text', text: /Nothing shipped yet this session/ })).toBeDefined()
    await startTurn($, 't9')
    expect(await alt(ui)).toMatch(/2048, score 777/)
  })

  test('two sessions share your games without overwriting them; stats stay per session', async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    await clickAt(ui, LCD.x + 80, LCD.y + 16 + 10) // open 2048 here
    const mine = h.store.get('save-v2') as Save

    // Meanwhile you play on in another long session.
    h.store.set('save-v2', { ...mine, g2048: { ...mine.g2048!, score: 4096, moves: 99 } })

    // This session finishing a turn must not write its stale copy over that game.
    await completeTurn($, 't1')
    const saved = h.store.get('save-v2') as Save
    expect(saved.g2048!.score).toBe(4096)
    expect(saved.g2048!.moves).toBe(99)
    expect(await alt(ui)).toMatch(/This session: 1 tasks shipped/)
  })

  test('background agents keep the arcade unlocked and show on the screen', async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    h.agents = [
      { id: 'a1', description: 'refactor', type: 'general-purpose', status: 'running' },
      { id: 'a2', description: 'tests', type: 'general-purpose', status: 'running' },
    ] as never
    const callTool = $.tool.call as unknown as (e: object) => Promise<unknown>
    await callTool({ tool: 'Agent', tool_use_id: 'u1', prompt: 'go', description: 'go' }).catch(() => undefined)
    await completeTurn($, 't1')
    // Your turn is over but 2 agents run: still playable, no "done" yet.
    expect(await alt(ui)).toMatch(/2 background agents working/)
    expect(await ui.find({ type: 'Text', text: /handed off to 2 background agents/ })).toBeDefined()
    expect(await ui.find({ key: 'jump-back' })).toBe(undefined)
    await clickAt(ui, LCD.x + 80, LCD.y + 16 + 10)
    expect(await alt(ui)).toMatch(/2048/)

    // One finishes, then the last: only then is Claude done.
    h.agents = [{ ...h.agents[0]!, status: 'completed' }, h.agents[1]!] as never
    await clock.advance(3_100)
    expect(await alt(ui)).toMatch(/1 background agent working/)
    h.agents = h.agents.map(a => ({ ...a, status: 'completed' })) as never
    await clock.advance(3_100)
    expect(await alt(ui)).toMatch(/Claude's resting.*Claude's done/)
    expect(await ui.find({ key: 'jump-back' })).toBeDefined()
  })

  test('test mode: /games test makes it playable while Claude is idle, and turns off again', async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)
    expect(await alt(ui)).toMatch(/Claude's resting/)
    const ran = await $.command.run({ command: 'games', args: 'test' } as never)
    expect(ran.text).toMatch(/test mode ON/)
    expect(await alt(ui)).toMatch(/test mode: MENU/)
    expect(await ui.find({ type: 'Text', text: /Test mode: playable anytime/ })).toBeDefined()
    await ui.press({ key: 'open-2048' })
    await ui.press({ key: 'pad-left' })
    await ui.press({ key: 'pad-up' })
    expect((h.store.get('save-v2') as Save).screen).toBe('2048')
    expect(((await ui.find({ type: 'Svg' }))?.props.source as string)).toContain('#ffb000') // the TEST MODE label
    await $.command.run({ command: 'games', args: 'test off' } as never)
    expect(await alt(ui)).toMatch(/Claude's resting/)
    expect(await ui.find({ key: 'btn-a' })).toBe(undefined)
  })

  test('the self-test tool reports live state and the event timeline', async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    await startTurn($, 't1')
    h.agents = [{ id: 'a1', description: 'x', type: 'general-purpose', status: 'running' }] as never
    const callTool = $.tool.call as unknown as (e: object) => Promise<{ result?: unknown }>
    const ran = await callTool({ tool: 'mcp__while-you-wait__debug', tool_use_id: 'd1', action: 'status' })
    const report = JSON.parse(String(ran.result))
    expect(report.build).toBe('0.3.0')
    expect(report.live).toMatchObject({ phase: 'working', agents: 1, isTurnRunning: true })
    expect(report.timeline.map((t: { event: string }) => t.event)).toEqual(expect.arrayContaining(['session.start', 'turn.start', 'agents']))
    const on2 = JSON.parse(String((await callTool({ tool: 'mcp__while-you-wait__debug', tool_use_id: 'd2', action: 'test_on' })).result))
    expect(on2.live.testMode).toBe(true)
  })

  test('/games opens the pane', async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ran = await $.command.run({ command: 'games', args: '' } as never)
    expect(h.opened).toEqual(['arcade'])
    expect(ran.text).toMatch(/locked/)
  })

  test('the crossword takes clicks and typed letters, with its clues listed below', async ($, on) => {
    mock.clock(on, { now: T0 })
    harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    await ui.press({ key: 'open-crossword' })
    expect(await alt(ui)).toMatch(/Crossword cw-001/)
    await clickAt(ui, LCD.x + 28 + 21 + 10, LCD.y + 4 + 10) // tap row 0, col 1
    await ui.input({ key: 'letters', text: 'q', kind: 'change' }) // the typing box
    expect(await alt(ui)).toMatch(/Crossword cw-001: Q/)
    await ui.press({ key: 'btn-b' }) // erase
    expect(await alt(ui)).toMatch(/Crossword cw-001: \./)
    expect(await ui.find({ type: 'Text', text: 'ACROSS' })).toBeDefined()
  })

  test('a surface with no Client falls back to the plain drawing', async ($, on) => {
    mock.clock(on, { now: T0 })
    harness(on)
    await startSession($)
    const ui = await mountOn($, 'vscode')
    await startTurn($, 't1')
    expect(await ui.find({ type: 'Text', text: /SELECT GAME/ })).toBeDefined()
    await ui.press({ key: 'open-2048' })
    expect(await ui.find({ type: 'Text', text: /SCORE 0/ })).toBeDefined()
  })
})
