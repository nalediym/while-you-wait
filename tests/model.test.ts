import { describe, expect, test } from 'claude-code/testing'
import * as M from '../hooks/model'
import { keyToInput } from '../hooks/ui/keys'
import { PUZZLES } from '../hooks/games/puzzles'

const T0 = new Date(2026, 9, 15, 12).getTime()

describe('model', () => {
  test('nothing is playable unless Claude is working', () => {
    const s = M.freshSave(T0)
    expect(M.act(s, { kind: 'open', screen: '2048' }, M.freshLive(), T0, PUZZLES)).toBe(s)
    const attention = { ...M.turnStarted(M.freshLive(), 't', T0), phase: 'attention' as const }
    expect(M.act(s, { kind: 'open', screen: '2048' }, attention, T0, PUZZLES)).toBe(s)
    const working = M.turnStarted(M.freshLive(), 't', T0)
    expect(M.act(s, { kind: 'open', screen: '2048' }, working, T0, PUZZLES).screen).toBe('2048')
  })

  test('turns, work time and while-you-waited are tallied; interrupts are not shipped tasks', () => {
    let live = { ...M.turnStarted(M.freshLive(), 't1', T0), playedThisTurn: true }
    let { save, live: after } = M.turnCompleted(live, M.freshSave(T0), T0 + 90_000)
    expect(save.stats.today).toMatchObject({ turns: 1, turnsWhileWaited: 1, workMs: 90_000 })
    expect(after).toMatchObject({ phase: 'idle', banner: 'done' })
    live = M.turnStarted(after, 't2', T0 + 100_000)
    save = M.turnCompleted(live, save, T0 + 110_000, false).save
    expect(save.stats.allTime.turns).toBe(1)
    expect(save.stats.allTime.workMs).toBe(100_000)
  })

  test('tool calls count, and each edited file counts once a day', () => {
    let s = M.freshSave(T0)
    s = M.toolCalled(s, 'Edit', '/a.ts', T0)
    s = M.toolCalled(s, 'Write', '/a.ts', T0)
    s = M.toolCalled(s, 'Bash', undefined, T0)
    expect(s.stats.today).toMatchObject({ toolCalls: 3, filesEdited: 1 })
    s = M.toolCalled(s, 'Edit', '/a.ts', T0 + 86_400_000)
    expect(s.stats.today).toMatchObject({ toolCalls: 1, filesEdited: 1 }) // new day
    expect(s.stats.allTime).toMatchObject({ toolCalls: 4, filesEdited: 2 })
  })

  test('the pane offers itself once per turn, after 60s', () => {
    const live = M.turnStarted(M.freshLive(), 't1', T0)
    expect(M.shouldOffer(live, T0 + 59_000)).toBe(false)
    expect(M.shouldOffer(live, T0 + 60_000)).toBe(true)
    expect(M.shouldOffer({ ...live, offeredTurnId: 't1' }, T0 + 99_000)).toBe(false)
  })

  test('the headline leads with Claude\'s work', () => {
    const t = M.freshSave(T0).stats.today
    expect(M.headline({ ...t, turns: 14, boardsCleared: 6 })).toBe('Claude shipped 14 tasks while you cleared 6 boards.')
    expect(M.headline({ ...t, turns: 1 })).toBe('Claude shipped 1 task today. Nice delegating.')
  })

  test('a corrupt or old store value starts fresh', () => {
    expect(M.loadSave('garbage', T0).v).toBe(1)
    expect(M.loadSave({ v: 0 }, T0).screen).toBe('menu')
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
    let s = M.act(M.freshSave(T0), { kind: 'open', screen: 'crossword' }, live, T0, PUZZLES)
    expect(s.crossword?.puzzleId).toBe(p.id)
    for (let i = 0; i < 25; i++) {
      const ch = p.grid[Math.floor(i / 5)]![i % 5]!
      if (ch === '#') continue
      s = { ...s, crossword: { ...s.crossword!, cursor: i } }
      s = M.act(s, { kind: 'letter', ch }, live, T0, PUZZLES)
    }
    expect(s.crossword?.isSolved).toBe(true)
    expect(s.scores.crosswordsSolved).toEqual([p.id])
    expect(s.stats.today.boardsCleared).toBe(1)
    s = M.act(s, { kind: 'nextPuzzle' }, live, T0, PUZZLES)
    expect(s.crossword?.puzzleId).toBe(PUZZLES[1]!.id)
  })
})
