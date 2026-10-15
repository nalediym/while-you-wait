import { describe, expect, test } from 'claude-code/testing'
import * as M from '../hooks/model'
import { boxDelta, boxInputs, keyToInput } from '../hooks/ui/keys'
import { PUZZLES } from '../hooks/games/puzzles'
import { hitTest } from '../hooks/ui/grid'

const T0 = new Date(2026, 9, 15, 12).getTime()

describe('model', () => {
  test('nothing is playable unless Claude is working', () => {
    const s = M.freshSave()
    expect(M.act(s, { kind: 'open', screen: '2048' }, M.freshLive(), T0, PUZZLES)).toBe(s)
    const attention = { ...M.turnStarted(M.freshLive(), 't', T0), phase: 'attention' as const }
    expect(M.act(s, { kind: 'open', screen: '2048' }, attention, T0, PUZZLES)).toBe(s)
    const working = M.turnStarted(M.freshLive(), 't', T0)
    expect(M.act(s, { kind: 'open', screen: '2048' }, working, T0, PUZZLES).screen).toBe('2048')
  })

  test('turns, work time and while-you-waited are tallied for the session; interrupts are not shipped tasks', () => {
    let live = { ...M.turnStarted(M.freshLive(), 't1', T0), playedThisTurn: true }
    let { session, live: after } = M.turnCompleted(live, M.freshSession(), T0 + 90_000)
    expect(session).toMatchObject({ turns: 1, turnsWhileWaited: 1, workMs: 90_000 })
    expect(after).toMatchObject({ phase: 'idle', banner: 'done' })
    live = M.turnStarted(after, 't2', T0 + 100_000)
    session = M.turnCompleted(live, session, T0 + 110_000, false).session
    expect(session.turns).toBe(1)
    expect(session.workMs).toBe(100_000)
  })

  test('tool calls count, and each edited file counts once', () => {
    let t = M.freshSession()
    t = M.toolCalled(t, 'Edit', '/a.ts')
    t = M.toolCalled(t, 'Write', '/a.ts')
    t = M.toolCalled(t, 'Bash', undefined)
    t = M.toolCalled(t, 'Edit', '/b.ts')
    expect(t).toMatchObject({ toolCalls: 4, filesEdited: 2 })
  })

  test('the save never holds stats', () => {
    expect(Object.keys(M.freshSave())).not.toContain('stats')
    const v1 = { v: 1, screen: '2048', g2048: { board: [], score: 9 }, scores: { best2048Tile: 64 }, stats: { today: { turns: 99 } } }
    const loaded = M.loadSave(v1)
    expect(Object.keys(loaded)).not.toContain('stats')
    expect(loaded).toMatchObject({ v: 2, screen: '2048', scores: { best2048Tile: 64 } })
  })

  test('the pane offers itself once per turn, after 60s', () => {
    const live = M.turnStarted(M.freshLive(), 't1', T0)
    expect(M.shouldOffer(live, T0 + 59_000)).toBe(false)
    expect(M.shouldOffer(live, T0 + 60_000)).toBe(true)
    expect(M.shouldOffer({ ...live, offeredFor: live.busySince }, T0 + 99_000)).toBe(false)
  })

  test('background agents keep Claude busy; done only when the last one finishes', () => {
    let live = M.turnStarted(M.freshLive(), 't1', T0)
    let session = M.freshSession()
    let r = M.agentsChanged(live, session, 2, T0 + 5_000)
    expect(r.live.phase).toBe('working')
    // Your turn ends while 2 agents run: counted, but not done.
    r = M.turnCompleted(r.live, r.session, T0 + 20_000)
    expect(r).toMatchObject({ becameIdle: false, live: { phase: 'working', banner: null, agents: 2 } })
    expect(r.session.turns).toBe(1)
    r = M.agentsChanged(r.live, r.session, 1, T0 + 50_000)
    expect(r.becameIdle).toBe(false)
    r = M.agentsChanged(r.live, r.session, 0, T0 + 80_000)
    expect(r).toMatchObject({ becameIdle: true, live: { phase: 'idle', banner: 'done' } })
    expect(r.session.workMs).toBe(80_000) // the whole busy stretch, agents included
    // A busy stretch started by agents alone also unlocks the arcade.
    live = r.live
    session = r.session
    expect(M.agentsChanged(live, session, 1, T0 + 99_000).live.phase).toBe('working')
  })

  test('the headline leads with Claude\'s work', () => {
    const t = M.freshSession()
    expect(M.headline({ ...t, turns: 14, boardsCleared: 6 })).toBe('Claude shipped 14 tasks while you cleared 6 boards.')
    expect(M.headline({ ...t, turns: 1 })).toBe('Claude shipped 1 task this session. Nice delegating.')
  })

  test('a corrupt or old store value starts fresh', () => {
    expect(M.loadSave('garbage').v).toBe(2)
    expect(M.loadSave({ v: 0 }).screen).toBe('menu')
  })

  test('test mode makes every input count even while Claude is idle', () => {
    const s = M.freshSave()
    const idle = { ...M.freshLive(), testMode: true }
    expect(M.act(s, { kind: 'open', screen: '2048' }, idle, T0, PUZZLES).screen).toBe('2048')
  })

  test('keyboard box: one new key per change, whether the box clears or keeps its text', () => {
    // A box that clears after each key: every change is one key, repeats included.
    expect(boxDelta('', 'd')).toEqual({ typed: 'd', erased: 0 })
    expect(boxDelta('d', 'd')).toEqual({ typed: 'd', erased: 0 })
    expect(boxDelta('d', 's')).toEqual({ typed: 's', erased: 0 })
    // A box that keeps its text: each change adds to it, or backspaces.
    expect(boxDelta('dd', 'dds')).toEqual({ typed: 's', erased: 0 })
    expect(boxDelta('dds', 'dd')).toEqual({ typed: '', erased: 1 })
    expect(boxDelta('ab', 'abcd')).toEqual({ typed: 'cd', erased: 0 }) // a paste, or keys faster than a frame
  })

  test('keyboard box inputs per screen: WASD moves, letters type in the crossword, backspace erases', () => {
    expect(boxInputs('2048', '', 'w')).toEqual([{ kind: 'dir', dir: 'up' }])
    expect(boxInputs('mines', 'w', 'wz')).toEqual([{ kind: 'a' }])
    expect(boxInputs('mines', '', 'x')).toEqual([{ kind: 'b' }])
    expect(boxInputs('crossword', 'ca', 'cat')).toEqual([{ kind: 'letter', ch: 't' }])
    expect(boxInputs('crossword', 'cat', 'ca')).toEqual([{ kind: 'erase' }])
    expect(boxInputs('menu', '', 'q')).toEqual([])
  })

  test('keys: WASD moves except in the crossword, where letters type', () => {
    expect(keyToInput('2048', 'w')).toEqual({ kind: 'dir', dir: 'up' })
    expect(keyToInput('2048', 'left')).toEqual({ kind: 'dir', dir: 'left' })
    expect(keyToInput('crossword', 'w')).toEqual({ kind: 'letter', ch: 'w' })
    expect(keyToInput('mines', 'f')).toEqual({ kind: 'b' })
  })

  test('solving a crossword records it and moves on to the next unsolved one', () => {
    const p = PUZZLES[0]!
    const live = M.turnStarted(M.freshLive(), 't', T0)
    let s = M.act(M.freshSave(), { kind: 'open', screen: 'crossword' }, live, T0, PUZZLES)
    expect(s.crossword?.puzzleId).toBe(p.id)
    let finished = 0
    for (let i = 0; i < 25; i++) {
      const ch = p.grid[Math.floor(i / 5)]![i % 5]!
      if (ch === '#') continue
      const before = { ...s, crossword: { ...s.crossword!, cursor: i } }
      s = M.act(before, { kind: 'letter', ch }, live, T0, PUZZLES)
      finished += M.boardsFinished(before, s)
    }
    expect(finished).toBe(1)
    expect(s.crossword?.isSolved).toBe(true)
    expect(s.scores.crosswordsSolved).toEqual([p.id])
    s = M.act(s, { kind: 'nextPuzzle' }, live, T0, PUZZLES)
    expect(s.crossword?.puzzleId).toBe(PUZZLES[1]!.id)
  })
})

describe('grid hit-testing', () => {
  test('taps map to squares and gaps map to nothing', () => {
    const g = { cols: 9, cw: 2, ch: 1, gapX: 1, gapY: 0, line: '#000', cells: Array(81).fill({ t: '', fg: '', bg: '' }) }
    expect(hitTest(g, 0, 0)).toEqual({ col: 0, row: 0 })
    expect(hitTest(g, 2, 0)).toBe(null) // the gap column
    expect(hitTest(g, 25, 8)).toEqual({ col: 8, row: 8 })
    expect(hitTest(g, 27, 0)).toBe(null) // past the edge
  })
})
