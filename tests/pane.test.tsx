import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { Save } from '../types'
import { BUILD } from '../hooks/register'
import { harness } from './harness'

const PLUGIN = 'while-you-wait'
const T0 = Date.UTC(2026, 9, 15, 12, 0, 0)
const DEV_TOOLS = { options: { devTools: true } }

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

describe('the handheld on desktop', () => {
  test('locked while idle, playable while working, paused + saved when Claude is done', async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)

    // Idle: the resting screen, and no controls to play with.
    expect(await alt(ui)).toMatch(/Claude's resting/)
    expect(await ui.find({ key: 'btn-a' })).toBe(undefined)

    // Claude starts working: the menu. Pick 2048.
    await startTurn($, 't1')
    expect(await alt(ui)).toMatch(/Select game: 2048/)
    await ui.press({ key: 'open-2048' })
    expect(await alt(ui)).toMatch(/2048, score 0/)

    // The real D-pad buttons slide tiles.
    for (const dir of ['left', 'up', 'right', 'down', 'left', 'up']) await ui.press({ key: `pad-${dir}` })
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

  test('mines: A digs, B flags, FLAG mode makes A flag', async ($, on) => {
    mock.clock(on, { now: T0 })
    harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    await ui.press({ key: 'open-mines' })
    expect(await alt(ui)).toMatch(/Mines, ready/)
    await ui.press({ key: 'btn-b' }) // flag the centre
    expect(await alt(ui)).toMatch(/9 flags left/)
    await ui.press({ key: 'flag-mode' })
    expect(await alt(ui)).toMatch(/flag mode on/)
    expect((await ui.find({ key: 'btn-a' }))?.props.label).toBe('A flag')
    await ui.press({ key: 'btn-a' }) // in flag mode A flags too: here it lifts the flag
    expect(await alt(ui)).toMatch(/10 flags left/)
    await ui.press({ key: 'flag-mode' })
    await ui.press({ key: 'btn-a' }) // dig the centre: always safe
    expect(await alt(ui)).toMatch(/Mines, (playing|won)/)
    await ui.press({ key: 'btn-start' })
    expect(await alt(ui)).toMatch(/Mines, ready/)
  })

  test('a permission prompt pauses with "Claude needs you"; its button jumps back', async ($, on) => {
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
    await ui.press({ key: 'jump-back' })
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
    await ui.press({ key: 'open-2048' }) // open 2048 here
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
    await ui.press({ key: 'open-2048' })
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

  test("a background workflow keeps the arcade unlocked, though agent.list() leaves its agents out (seen live)", async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    h.agents = [{ id: 'a1', description: 'tests', type: 'general-purpose', status: 'running' }] as never
    const callTool = $.tool.call as unknown as (e: object) => Promise<unknown>
    await callTool({ tool: 'Workflow', tool_use_id: 'u1', script: 'export const meta = {}' })
    await completeTurn($, 't1')
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [{ id: 'wtask1', type: 'workflow', status: 'running', description: 'lesson 1' }] })
    expect(await alt(ui)).toMatch(/2 background agents working/)

    // The plain agent finishes; the workflow's agents end their turns, which no list shows.
    h.agents = [{ ...h.agents[0]!, status: 'completed' }] as never
    await clock.advance(3_100)
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 'w-turn', reason: 'answer', agentId: 'workflow-agent-1' } as never)
    await $.classic.SubagentStop({ stop_hook_active: false, agent_id: 'workflow-agent-1', agent_transcript_path: '', agent_type: 'workflow-subagent', background_tasks: [{ id: 'wtask1', type: 'workflow', status: 'running', description: 'lesson 1' }] })
    expect(await alt(ui)).toMatch(/1 background agent working/)

    // The run ends: its notification starts a turn, and Claude stops with nothing left in flight.
    await startTurn($, 't2')
    await completeTurn($, 't2')
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
    expect(await alt(ui)).toMatch(/Claude's resting.*Claude's done/)
  })

  test('a workflow that began before this build loaded counts from its first agent', async ($, on) => {
    mock.clock(on, { now: T0 })
    harness(on)
    await startSession($)
    const ui = await mountPane($)
    expect(await alt(ui)).toMatch(/Claude's resting/)
    await $.agent.spawn({ prompt: 'solve', description: 'solve', workflow: { runId: 'wf_1', agentIndex: 1 } } as never)
    expect(await alt(ui)).toMatch(/1 background agent working/)
    await $.agent.spawn({ prompt: 'verify', description: 'verify', workflow: { runId: 'wf_1', agentIndex: 2 } } as never)
    expect(await alt(ui)).toMatch(/1 background agent working/) // one run, however many agents
  })

  test('⌨ Use keyboard: one button turns keyboard mode on (and tries to focus its field) and off', DEV_TOOLS, async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    expect(await ui.find({ key: 'keys' })).toBe(undefined) // no text field until you ask for keys
    await ui.press({ key: 'keyboard-mode' })
    expect(await ui.find({ key: 'keys' })).toBeDefined()
    // It tries to move the keyboard into the field, and logs how that went (devTools: read live via the debug tool).
    const timeline = h.store.get('debug-timeline') as { event: string; note?: string }[]
    expect(timeline.at(-1)).toMatchObject({ event: 'keyboard-mode on', note: expect.stringMatching(/focus/) })
    await ui.press({ key: 'keyboard-mode' })
    expect(await ui.find({ key: 'keys' })).toBe(undefined)
  })

  test('keyboard mode plays every game with WASD, Z, X, N and Enter', async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    await ui.press({ key: 'keyboard-mode' })
    // Menu: S moves down, Enter plays the game under the cursor.
    await ui.input({ key: 'keys', text: 's', kind: 'change' })
    await ui.input({ key: 'keys', text: 'ss', kind: 'change' }) // a box that keeps its text
    await ui.input({ key: 'keys', text: 'ss', kind: 'submit' })
    expect(await alt(ui)).toMatch(/Crossword/)
    await ui.press({ key: 'btn-select' })
    await ui.press({ key: 'open-2048' })
    // 2048: a box that clears after each key, the same key twice still counts twice.
    const before = (h.store.get('save-v2') as Save).g2048!.moves
    for (const k of ['a', 'w', 'd', 's', 'a', 'a', 'w', 'w']) await ui.input({ key: 'keys', text: k, kind: 'change' })
    expect((h.store.get('save-v2') as Save).g2048!.moves).toBeGreaterThan(before)
    await ui.input({ key: 'keys', text: 'n', kind: 'change' })
    expect((h.store.get('save-v2') as Save).g2048!.moves).toBe(0) // N = new board
  })

  test('race: a turn starting as the last agent finishes stays a running turn (seen live)', DEV_TOOLS, async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    h.agents = [{ id: 'a1', description: 'x', type: 'general-purpose', status: 'running' }] as never
    await completeTurn($, 't1') // syncs: 1 agent, so still working
    expect(await alt(ui)).toMatch(/1 background agent working/)
    // The agent finishes and wakes Claude: its turn.complete and the new turn.start race.
    h.agents = [{ ...h.agents[0]!, status: 'completed' }] as never
    await Promise.all([
      $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 'a-turn', reason: 'answer', agentId: 'a1' } as never),
      startTurn($, 't2'),
    ])
    await clock.advance(3_100)
    const callTool = $.tool.call as unknown as (e: object) => Promise<{ result?: unknown }>
    const report = JSON.parse(String((await callTool({ tool: 'mcp__while-you-wait__debug', tool_use_id: 'd', action: 'status' })).result))
    expect(report.live).toMatchObject({ isTurnRunning: true, phase: 'working', agents: 0 })
    expect(await alt(ui)).not.toMatch(/resting/)
  })

  test('test mode: /games test makes it playable while Claude is idle, and turns off again', async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    const ui = await mountPane($)
    expect(await alt(ui)).toMatch(/Claude's resting/)
    // A first-timer is shown how to try it now, on the handheld and under it.
    expect(await alt(ui)).toMatch(/Try \/games test/)
    expect(await ui.find({ type: 'Text', text: /New here\? Type \/games test/ })).toBeDefined()
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
    // Once they've played, the hint is gone: nothing invites play while Claude is idle.
    expect(await alt(ui)).not.toMatch(/games test/)
    expect(await ui.find({ type: 'Text', text: /New here\?/ })).toBe(undefined)
  })

  test('players get no debug tool and no timeline', async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    await startTurn($, 't1')
    await completeTurn($, 't1')
    expect(h.tools).toEqual([])
    expect(h.store.has('debug-timeline')).toBe(false)
  })

  test('devTools: the debug tool reports live state and the event timeline', DEV_TOOLS, async ($, on) => {
    mock.clock(on, { now: T0 })
    const h = harness(on)
    await startSession($)
    expect(h.tools).toEqual(['debug'])
    await startTurn($, 't1')
    h.agents = [{ id: 'a1', description: 'x', type: 'general-purpose', status: 'running' }] as never
    const callTool = $.tool.call as unknown as (e: object) => Promise<{ result?: unknown }>
    const ran = await callTool({ tool: 'mcp__while-you-wait__debug', tool_use_id: 'd1', action: 'status' })
    const report = JSON.parse(String(ran.result))
    expect(report.build).toBe(BUILD)
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

  test('the crossword takes the D-pad and typed letters, with its clues listed below', async ($, on) => {
    mock.clock(on, { now: T0 })
    harness(on)
    await startSession($)
    const ui = await mountPane($)
    await startTurn($, 't1')
    await ui.press({ key: 'open-crossword' })
    expect(await alt(ui)).toMatch(/Crossword cw-001/)
    await ui.press({ key: 'keyboard-mode' })
    await ui.press({ key: 'pad-right' })
    await ui.input({ key: 'keys', text: 'q', kind: 'change' }) // keyboard mode's field
    expect(await alt(ui)).toMatch(/Crossword cw-001: Q/)
    await ui.press({ key: 'btn-b' }) // erase
    expect(await alt(ui)).toMatch(/Crossword cw-001: \./)
    expect(await ui.find({ type: 'Text', text: 'ACROSS' })).toBeDefined()
  })

  test('any surface but the desktop gets the plain drawing', async ($, on) => {
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
