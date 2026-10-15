// while-you-wait: a Game Boy-style arcade in a side pane that is playable
// only while Claude works. This file only wires engine events to the pure
// model (model.ts) and the drawing (ui/pane.tsx).

import { update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ClickLog, Lcd, Live, Save, SessionStats, TraceEntry } from '../types'
import { PUZZLES } from './games/puzzles'
import type { Input } from './model'
import * as M from './model'
import { keyToInput } from './ui/keys'
import { drawPane } from './ui/pane'
import type { ScreenPost } from './ui/screen'
import type { PadPost } from './ui/pad'

const PANE = 'arcade'
const TITLE = 'While You Wait'
const STORE_KEY = 'save-v2' // games and bests only; stats are never stored
const OLD_STORE_KEY = 'save-v1' // v1 also kept stats; its games and bests carry over

const liveRef = { plugin: 'while-you-wait', key: 'live' } as const
const saveRef = { plugin: 'while-you-wait', key: 'save' } as const
const sessionRef = { plugin: 'while-you-wait', key: 'session' } as const
const CLICK_LOG_KEY = 'click-log' // the last screen taps, raw, for diagnosing taps that land wrong
const TRACE_KEY = 'debug-timeline' // the last events and the state after each: what the self-test reads
const AGENT_POLL_MS = 3_000
export const BUILD = '0.3.0' // keep in step with plugin.json; the timeline records which build loaded
const DEBUG_TOOL = 'mcp__while-you-wait__debug'
const lcdRef = { plugin: 'while-you-wait', key: 'lcd' } as const

// Spread over a fresh value so a Live saved by an older version of this code still reads whole.
const getLive = async ($: EngineInterface): Promise<Live> => ({ ...M.freshLive(), ...(await $.state.get(liveRef)).value })
const getSave = async ($: EngineInterface): Promise<Save> => (await $.state.get(saveRef)).value ?? M.freshSave()
const getSession = async ($: EngineInterface): Promise<SessionStats> => (await $.state.get(sessionRef)).value ?? M.freshSession()

const setLive = ($: EngineInterface, f: (l: Live) => Live) => update($, liveRef, l => f({ ...M.freshLive(), ...l }))
/** This session's stats: $.state only, so they last the session (and a hot reload) and no longer. */
const setSession = ($: EngineInterface, f: (s: SessionStats) => SessionStats) => update($, sessionRef, s => f(s ?? M.freshSession()))

const readStore = async ($: EngineInterface): Promise<unknown> => (await $.store.get(STORE_KEY)) ?? (await $.store.get(OLD_STORE_KEY))

/**
 * Every session shares one save (your games and bests) in $.store, so it is
 * the source of truth: each change reads it fresh, applies just that change
 * and writes it back, then mirrors it into this session's $.state for
 * drawing. A long-lived session therefore never writes a stale copy over a
 * game you played in another one. Changes made here queue up one at a time.
 */
let queue: Promise<unknown> = Promise.resolve()
const mutate = ($: EngineInterface, f: (s: Save, now: number) => Save): Promise<Save> => {
  const run = queue.then(async () => {
    const now = await $.clock.now()
    const stored = await readStore($)
    const base = stored === undefined ? await getSave($) : M.loadSave(stored)
    const next = f(base, now)
    if (next !== base) await $.store.set(STORE_KEY, next)
    await $.state.set(saveRef, next)
    return next
  })
  queue = run.catch(() => undefined)
  return run
}

/** Picks up what other sessions saved (a game played there, their stats). */
const refresh = ($: EngineInterface) => mutate($, s => s)

const isPaneOpen = async ($: EngineInterface) => (await $.ui.panes()).some(p => p.id === PANE)

/** Offers the pane once per busy stretch: opens it beside the transcript, never taking focus. */
const offer = async ($: EngineInterface) => {
  const live = await getLive($)
  if (!M.shouldOffer(live, await $.clock.now())) return
  await setLive($, l => ({ ...l, offeredFor: live.busySince }))
  if (await isPaneOpen($)) return trace($, 'offer', 'pane already open')
  const opened = await $.ui.open({ id: PANE, title: TITLE })
  if (!opened.isPlaced) $.ui.status("🎮 Claude's on a long one — /games while you wait")
  await trace($, 'offer', opened.isPlaced ? 'pane opened' : `not placed: ${opened.reason}`)
}

const scheduleOffer = async ($: EngineInterface) => {
  const live = await getLive($)
  if (live.phase !== 'working' || live.busySince === null || live.offeredFor === live.busySince) return
  const wait = Math.max(0, live.busySince + M.OFFER_AFTER_MS - (await $.clock.now()))
  $.clock.after(wait, () => void offer($))
}

/** One input from a key, a tap or a button. Ignored unless Claude is working. */
const send = async ($: EngineInterface, input: Input) => {
  const live = await getLive($)
  let changed = false
  let finished = 0
  await mutate($, (s, now) => {
    const next = M.act(s, input, live, now, PUZZLES)
    changed = next !== s
    finished = M.boardsFinished(s, next)
    return next
  })
  if (finished > 0) await setSession($, t => ({ ...t, boardsCleared: t.boardsCleared + finished }))
  if (changed && !live.playedThisTurn) await setLive($, l => ({ ...l, playedThisTurn: true }))
}

/** Applies a settled phase change; going idle freezes every game clock, saved exactly as it is. */
const applySettled = async ($: EngineInterface, r: { live: Live; session: SessionStats; becameIdle: boolean }) => {
  await $.state.set(sessionRef, r.session)
  await $.state.set(liveRef, r.live)
  if (r.becameIdle) {
    await mutate($, M.pauseAll)
    $.ui.status(undefined)
  }
}

const RUNNING = new Set(['pending', 'running'])

/** Recounts this session's running agents; the last one finishing is when Claude is done. */
const syncAgents = async ($: EngineInterface) => {
  const running = (await $.agent.list()).filter(a => RUNNING.has(a.status)).length
  const live = await getLive($)
  if (running === live.agents) return
  const wasIdle = live.phase === 'idle'
  const r = M.agentsChanged(live, await getSession($), running, await $.clock.now())
  await applySettled($, r)
  await trace($, 'agents', `${live.agents} -> ${running}${r.becameIdle ? ', Claude done' : ''}`)
  if (wasIdle && running > 0) await scheduleOffer($)
}

const logClick = async ($: EngineInterface, entry: Omit<ClickLog, 'at'>) => {
  const log = ((await $.store.get(CLICK_LOG_KEY)) as ClickLog[] | undefined) ?? []
  await $.store.set(CLICK_LOG_KEY, [...log, { at: await $.clock.now(), ...entry }].slice(-30))
}

/** Appends to the debug timeline: the event and the state right after it. */
const trace = async ($: EngineInterface, event: string, note?: string) => {
  const live = await getLive($)
  const entry: TraceEntry = { at: await $.clock.now(), event, phase: live.phase, agents: live.agents, isTurnRunning: live.isTurnRunning, testMode: live.testMode, ...(note ? { note } : {}) }
  const log = ((await $.store.get(TRACE_KEY)) as TraceEntry[] | undefined) ?? []
  await $.store.set(TRACE_KEY, [...log, entry].slice(-80))
}

const setTestMode = async ($: EngineInterface, on: boolean) => {
  await setLive($, l => ({ ...l, testMode: on }))
  await trace($, on ? 'test-mode on' : 'test-mode off')
}

const attention = async ($: EngineInterface, why: string) => {
  await setLive($, M.needsAttention)
  await mutate($, M.pauseAll)
  await trace($, 'needs-you', why)
}

/** The self-test tool's answer: the live state, the timeline, and an action's effect. */
const debugTool = async ($: EngineInterface, input: unknown): Promise<string> => {
    const action = String((input as { action?: unknown }).action ?? 'status')
    if (action === 'test_on' || action === 'test_off') await setTestMode($, action === 'test_on')
    if (action === 'banner_done' || action === 'banner_needs_you' || action === 'banner_clear') {
      await setLive($, l => ({ ...l, banner: action === 'banner_done' ? 'done' : action === 'banner_needs_you' ? 'needs-you' : null }))
      await trace($, action)
    }
    await syncAgents($).catch(() => undefined)
    const save = await getSave($)
    const result = {
      build: BUILD,
      live: await getLive($),
      session: { ...(await getSession($)), files: undefined },
      agentList: (await $.agent.list()).map(a => ({ id: a.id, status: a.status, description: a.description })),
      paneOpen: await isPaneOpen($),
      save: { screen: save.screen, g2048: save.g2048 && { score: save.g2048.score, moves: save.g2048.moves }, mines: save.mines?.status ?? null, crossword: save.crossword?.puzzleId ?? null, scores: save.scores },
      timeline: (((await $.store.get(TRACE_KEY)) as TraceEntry[] | undefined) ?? []).slice(-25),
      clickLog: (((await $.store.get(CLICK_LOG_KEY)) as ClickLog[] | undefined) ?? []).slice(-10),
    }
    return JSON.stringify(result, null, 1)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'games', description: 'Open the While-You-Wait arcade (playable while Claude works). /games test toggles test mode.', argumentHint: '[test]' })
    await $.tool.register({
      name: 'debug',
      description:
        "Self-test for the while-you-wait arcade plugin: read its live state (phase, running agents, test mode, this session's stats, the save) and its recent event timeline; switch test mode on or off; or show a banner to check how it looks. Use only when checking or debugging the arcade.",
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['status', 'test_on', 'test_off', 'banner_done', 'banner_needs_you', 'banner_clear'] },
        },
        required: ['action'],
      },
    })
    // A hot reload fires this again mid-session: keep what $.state already holds.
    if ((await $.state.get(saveRef)).version === 0) await $.state.set(saveRef, M.loadSave(await readStore($)))
    if ((await $.state.get(sessionRef)).version === 0) await $.state.set(sessionRef, M.freshSession())
    if ((await $.state.get(liveRef)).version === 0) await $.state.set(liveRef, M.freshLive())
    else await scheduleOffer($)
    await syncAgents($).catch(() => undefined) // a reload mid-run must pick up agents already running
    await trace($, 'session.start', `build ${BUILD}`)
    // Background agents end on their own time: recount them every few seconds while any run.
    $.clock.every(AGENT_POLL_MS, async () => {
      if ((await getLive($)).agents > 0) await syncAgents($).catch(() => undefined)
    })
    return next(e)
  })

  on('command.run', { command: 'games' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg.startsWith('test')) {
      const isOn = arg === 'test on' ? true : arg === 'test off' ? false : !(await getLive($)).testMode
      await setTestMode($, isOn)
      await refresh($)
      await $.ui.open({ id: PANE, title: TITLE })
      return { text: isOn ? 'Arcade test mode ON: playable anytime, this session only. /games test turns it off.' : 'Arcade test mode OFF: playable only while Claude works.' }
    }
    await refresh($)
    await $.ui.open({ id: PANE, title: TITLE })
    const live = await getLive($)
    return {
      text:
        live.phase === 'working' || live.testMode
          ? 'Arcade open. Play away.'
          : "Arcade open. Claude's resting, so it's locked. Go ship something.",
    }
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await setLive($, l => M.turnStarted(l, e.turnId, now))
    await trace($, 'turn.start')
    await refresh($)
    $.ui.status(undefined)
    await scheduleOffer($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      // An agent's turn, not yours: it may have been the last one still running.
      await trace($, 'agent turn.complete', e.agentId)
      await syncAgents($).catch(() => undefined)
      return next(e)
    }
    await syncAgents($).catch(() => undefined) // agents still running keep the arcade open
    const done = M.turnCompleted(await getLive($), await getSession($), await $.clock.now(), e.reason === 'answer')
    await applySettled($, done)
    if (!done.becameIdle) await mutate($, M.pauseAll) // your turn's over: freeze clocks until you play again
    await trace($, 'turn.complete', done.becameIdle ? "Claude's done" : `still busy: ${done.live.agents} agents`)
    return next(e)
  })

  // Observers, not guards: if one fails, whatever it watched goes on untouched.
  on('tool.call', async ($, e, next) => {
    if (String(e.tool) === DEBUG_TOOL) return { result: await debugTool($, e) } as Awaited<ReturnType<typeof next>>
    const path = (e as { file_path?: unknown; notebook_path?: unknown }).file_path ?? (e as { notebook_path?: unknown }).notebook_path
    await setSession($, t => M.toolCalled(t, String(e.tool), typeof path === 'string' ? path : undefined))
    if (String(e.tool) === 'AskUserQuestion') await attention($, 'AskUserQuestion')
    const ran = await next(e)
    // Any permission prompt or question for this call has been answered by now.
    await setLive($, M.attentionCleared)
    if (String(e.tool) === 'Agent' || String(e.tool) === 'Task') await syncAgents($).catch(() => undefined)
    return ran
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', async ($, e, next) => {
    await attention($, `permission: ${e.tool_name}`)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' || e.notification_type === 'elicitation_dialog') await attention($, e.notification_type)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.message', { requestId: PANE }, async ($, e, next) => {
    const post = e.data as ScreenPost | PadPost
    const save = await getSave($)
    const live = await getLive($)
    if (post.type === 'press') {
      await logClick($, { press: post.press ? post.press.kind : 'nothing', ...post.raw })
      if (!post.press) return next(e)
    }
    const onScreen = post.type === 'press' && post.press !== null && ['lcd', 'cell', 'row', 'header'].includes(post.press.kind)
    if (onScreen && live.phase === 'attention') {
      await $.ui.close({ id: PANE }) // the "go answer Claude" box
      return next(e)
    }
    const input: Input | undefined =
      post.type === 'press'
        ? post.press ? M.pressToInput(save.screen, post.press, post.button) : undefined
        : post.type === 'tap'
          ? { kind: 'tap', col: post.col, row: post.row, button: post.button }
          : post.ctrl || post.meta
            ? undefined
            : keyToInput(save.screen, post.key)
    if (input) await send($, input)
    return next(e)
  })

  on('ui.fault', { requestId: PANE }, async ($, e, next) => {
    await $.state.set(lcdRef, { hasFailed: true } satisfies Lcd)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const live = await getLive($)
    const save = await getSave($)
    const session = await getSession($)
    const lcd: Lcd = (await $.state.get(lcdRef)).value ?? { hasFailed: false }
    return drawPane(
      { Box: els.Box, Text: els.Text, Button: els.Button, ...('Client' in els ? { Client: els.Client } : {}), ...('Svg' in els ? { Svg: els.Svg } : {}), ...('Input' in els ? { Input: els.Input } : {}) },
      { live, save, session, now: await $.clock.now(), puzzles: PUZZLES, useClient: e.surface === 'desktop' && !lcd.hasFailed },
      {
        send: input => void send($, input),
        jumpBack: () => void $.ui.close({ id: PANE }),
      },
    )
  })
}
