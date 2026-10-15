import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { Save } from '../types'
import { harness } from './harness'

const PLUGIN = 'while-you-wait'
const T0 = Date.UTC(2026, 9, 15, 12, 0, 0)

const PANE_PROPS = {
  title: 'While You Wait',
  isFocused: false,
  bodyColumns: 40,
  placement: 'dock',
  scroll: { top: 0, bodyRows: 40 },
  view: {},
} as never

const mountPane = ($: Engine) =>
  $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'arcade', props: PANE_PROPS, viewport: { columns: 44, rows: 60, isFullscreen: true } })

const startSession = ($: Engine) => $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true, startedAt: T0 } as never)
const startTurn = ($: Engine, turnId: string) => $.turn.start({ text: 'build it', turnId })
const completeTurn = ($: Engine, turnId: string) =>
  $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId, reason: 'answer' } as never)

const shows = async (ui: { find: (q: { text: RegExp }) => Promise<unknown> }, text: RegExp) => (await ui.find({ text })) !== undefined

describe('arcade pane on desktop', () => {
  test('locked while idle, playable while working, paused + saved when Claude is done', async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    const h = harness(on)
    const { opened, closed } = h
    await startSession($)
    const ui = await mountPane($)

    // Idle: the resting screen with stats, and no controls to play with.
    expect(await shows(ui, /CLAUDE'S RESTING/)).toBe(true)
    expect(await ui.find({ key: 'pad-up' })).toBe(undefined)

    // Claude starts working: the menu appears.
    await startTurn($, 't1')
    expect(await shows(ui, /SELECT GAME/)).toBe(true)
    await ui.press({ key: 'open-2048' })
    expect(await shows(ui, /SCORE 0/)).toBe(true)
    expect(await ui.find({ type: 'Client', key: 'lcd-2048' })).toBeDefined()

    // Keys pressed on the LCD reach the game (arrows and WASD).
    const before = JSON.stringify(await ui.drawn({ in: 'lcd-2048' }))
    for (const key of ['left', 'up', 'right', 'down', 'a', 'w', 'd', 's']) await ui.key({ key, in: 'lcd-2048' })
    expect(JSON.stringify(await ui.drawn({ in: 'lcd-2048' }))).not.toBe(before)

    // A turn running 60s offers the pane, once.
    expect(opened).toEqual([])
    await clock.advance(61_000)
    expect(opened).toEqual(['arcade'])
    await clock.advance(120_000)
    expect(opened).toEqual(['arcade'])

    // Claude finishes: banner in the pane, game locked, state saved to the store.
    await completeTurn($, 't1')
    expect(await shows(ui, /CLAUDE'S DONE/)).toBe(true)
    expect(await ui.find({ key: 'jump-back' })).toBeDefined()
    expect(await shows(ui, /CLAUDE'S RESTING/)).toBe(true)
    expect(await ui.find({ key: 'pad-up' })).toBe(undefined)
    const saved = (h.store.get('save-v1')) as Save
    expect(saved.screen).toBe('2048')
    expect(saved.g2048?.moves ?? 0).toBeGreaterThan(0)
    expect(saved.stats.today.turns).toBe(1)
    expect(saved.stats.today.turnsWhileWaited).toBe(1)
    expect(await shows(ui, /Claude shipped 1 task/)).toBe(true)

    // The jump-back button closes the pane.
    await ui.press({ key: 'jump-back' })
    expect(closed).toEqual(['arcade'])
  })

  test('a permission prompt pauses the game with a "needs you" banner', async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    await ui.press({ key: 'open-mines' })
    await ui.press({ key: 'btn-a' }) // dig the centre: first click is safe
    expect(await shows(ui, /MINES/)).toBe(true)

    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } } as never)
    expect(await shows(ui, /CLAUDE NEEDS YOU/)).toBe(true)
    expect(await shows(ui, /PAUSED/)).toBe(true)
    expect(await ui.find({ key: 'pad-up' })).toBe(undefined)
    const saved = (h.store.get('save-v1')) as Save
    expect(saved.mines?.runningSince).toBe(null) // clock banked exactly
  })

  test('next session resumes exactly where you left off', async ($, on) => {
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
    expect(await shows(ui, /Claude shipped 14 tasks while you cleared 6 boards/)).toBe(true)
    await startTurn($, 't9')
    expect(await shows(ui, /SCORE 777/)).toBe(true)
    expect(await ui.find({ type: 'Text', text: /1024/, in: 'lcd-2048' })).toBeDefined()
  })

  test('/games opens the pane', async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    const { opened, closed } = h
    await startSession($)
    const ran = await $.command.run({ command: 'games', args: '' } as never)
    expect(opened).toEqual(['arcade'])
    expect(ran.text).toMatch(/locked/)
  })

  test('the crossword takes typed letters from the LCD', async ($, on) => {
    mock.clock(on, { now: T0 })
    harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    await ui.press({ key: 'open-crossword' })
    expect(await ui.find({ type: 'Client', key: 'lcd-crossword' })).toBeDefined()
    await ui.key({ key: 'q', in: 'lcd-crossword' })
    expect(await ui.find({ type: 'Text', text: /Q/, in: 'lcd-crossword' })).toBeDefined()
    expect(await ui.find({ key: 'pad-up' })).toBeDefined()
  })
})
