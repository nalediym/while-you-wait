// while-you-wait: a Game Boy-style arcade in a side pane that is playable
// only while Claude works. This file only wires engine events to the pure
// model (model.ts) and the drawing (ui/pane.tsx). With the `devTools` option
// on, it also keeps an event timeline and registers the debug tool.

import type { EngineInterface, Register } from 'claude-code'

import type { Live, Save, SessionStats, TraceEntry } from '../types'
import { PUZZLES } from './games/puzzles'
import type { Input } from './model'
import * as M from './model'
import { boxInputs } from './ui/keys'
import { drawPane } from './ui/pane'

const PANE = 'arcade'
const TITLE = 'While You Wait'
const STORE_KEY = 'save-v2' // games and bests only; stats are never stored
const OLD_STORE_KEY = 'save-v1' // v1 also kept stats; its games and bests carry over

const liveRef = { plugin: 'while-you-wait', key: 'live' } as const
const saveRef = { plugin: 'while-you-wait', key: 'save' } as const
const sessionRef = { plugin: 'while-you-wait', key: 'session' } as const
const TRACE_KEY = 'debug-timeline' // the last events and the state after each: what the debug tool reads
const AGENT_POLL_MS = 3_000
export const BUILD = '0.3.8' // keep in step with plugin.json (scripts/check.sh checks); the timeline records which build loaded
const DEBUG_TOOL = 'mcp__while-you-wait__debug'

/** The `devTools` option (plugin.json userConfig): the event timeline and the debug tool. Off for players. */
let devTools = false

// Read field by field over a fresh value, so a Live an older build wrote reads whole and clean.
const LIVE_KEYS = Object.keys(M.freshLive()) as (keyof Live)[]
const cleanLive = (held: Partial<Live> | undefined): Live => {
  const fresh = M.freshLive()
  return Object.fromEntries(LIVE_KEYS.map(k => [k, held && k in held ? held[k] : fresh[k]])) as Live
}

/**
 * Where Claude is and this session's stats, as the logic sees them: kept in
 * this module, shared by every hook and always current. A hook's own reads
 * of $.state show the moment its dispatch began, so a hook that started
 * before a turn did would otherwise act on "no turn running" and write it
 * back. $.state still holds both, for drawing (a write redraws its readers)
 * and so a hot reload picks them up: each is read from there once per load.
 */
let liveNow: Live | undefined
let sessionNow: SessionStats | undefined
const getLive = async ($: EngineInterface): Promise<Live> => (liveNow ??= cleanLive((await $.state.get(liveRef)).value))
const getSession = async ($: EngineInterface): Promise<SessionStats> =>
  (sessionNow ??= (await $.state.get(sessionRef)).value ?? M.freshSession())
/** For drawing: reads $.state, which subscribes the pane to its changes. */
const drawnLive = async ($: EngineInterface): Promise<Live> => cleanLive((await $.state.get(liveRef)).value)
const drawnSession = async ($: EngineInterface): Promise<SessionStats> => (await $.state.get(sessionRef)).value ?? M.freshSession()
const getSave = async ($: EngineInterface): Promise<Save> => (await $.state.get(saveRef)).value ?? M.freshSave()


const readStore = async ($: EngineInterface): Promise<unknown> => (await $.store.get(STORE_KEY)) ?? (await $.store.get(OLD_STORE_KEY))

/**
 * Every change this session makes runs here, one at a time and in order, and
 * each one starts from the latest values. Hooks run concurrently (a turn
 * starting while an agent finishes), so a change computed from an older read
 * would otherwise write over a newer one. Work queued here must not queue more.
 */
let queue: Promise<unknown> = Promise.resolve()
const serial = <T,>(work: () => Promise<T>): Promise<T> => {
  const run = queue.then(work)
  queue = run.catch(() => undefined)
  return run
}

/**
 * Every session shares one save (your games and bests) in $.store, so it is
 * the source of truth: each change reads it fresh, applies just that change
 * and writes it back, then mirrors it into this session's $.state for
 * drawing. A long-lived session therefore never writes a stale copy over a
 * game you played in another one.
 */
const mutate = ($: EngineInterface, f: (s: Save, now: number) => Save): Promise<Save> =>
  serial(async () => {
    const now = await $.clock.now()
    const stored = await readStore($)
    const base = stored === undefined ? await getSave($) : M.loadSave(stored)
    const next = f(base, now)
    if (next !== base) await $.store.set(STORE_KEY, next)
    await $.state.set(saveRef, next)
    return next
  })

type Tx = { live: Live; session: SessionStats; becameIdle?: boolean }

/** Changes where Claude is (live) and this session's stats together, from their latest values. */
const transact = ($: EngineInterface, f: (tx: Tx, now: number) => Tx): Promise<{ before: Tx; after: Tx }> =>
  serial(async () => {
    const now = await $.clock.now()
    const before: Tx = { live: await getLive($), session: await getSession($) }
    const after = f(before, now)
    liveNow = after.live
    sessionNow = after.session
    if (after.live !== before.live) await $.state.set(liveRef, after.live)
    if (after.session !== before.session) await $.state.set(sessionRef, after.session)
    return { before, after }
  })

const setLive = ($: EngineInterface, f: (l: Live) => Live) => transact($, tx => ({ ...tx, live: f(tx.live) }))
/** This session's stats: $.state only, so they last the session (and a hot reload) and no longer. */
const setSession = ($: EngineInterface, f: (s: SessionStats) => SessionStats) => transact($, tx => ({ ...tx, session: f(tx.session) }))

/** Picks up what other sessions saved (a game played there, their stats). */
const refresh = ($: EngineInterface) => mutate($, s => s)

const isPaneOpen = async ($: EngineInterface) => (await $.ui.panes()).some(p => p.id === PANE)

/** Offers the pane once per busy stretch: opens it beside the transcript, never taking focus. */
const offer = async ($: EngineInterface) => {
  const { before, after } = await transact($, (tx, now) =>
    M.shouldOffer(tx.live, now) ? { ...tx, live: { ...tx.live, offeredFor: tx.live.busySince } } : tx,
  )
  if (before.live === after.live) return
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

/** What the keyboard box last held, per screen: each change is read against it. */
let boxText = ''
let boxScreen = ''

const typedInBox = async ($: EngineInterface, value: string, isEnter: boolean) => {
  const screen = (await getSave($)).screen
  if (screen !== boxScreen) {
    boxScreen = screen
    boxText = ''
  }
  // Enter sends the box's text as it stands: only new keys in it count, then A.
  const inputs = isEnter && value === boxText ? [] : boxInputs(screen, boxText, value)
  boxText = value
  await trace($, isEnter ? 'keys enter' : 'keys typed', `${JSON.stringify(value)} on ${screen} -> ${inputs.map(i => (i.kind === 'dir' ? i.dir : i.kind)).join(' ') || 'nothing'}`)
  for (const input of inputs) await send($, input)
  if (isEnter) {
    boxText = ''
    await send($, { kind: 'a' })
  }
}

/** The ⌨ button. Turning it on moves the keyboard into the keys field, and logs whether that took. */
const toggleKeyboard = async ($: EngineInterface) => {
  const { after } = await setLive($, l => ({ ...l, keyboardMode: !l.keyboardMode }))
  boxText = ''
  if (!after.live.keyboardMode) return trace($, 'keyboard-mode off')
  const focused = await $.ui.focus({ requestId: PANE, key: 'keys' }).catch((err: unknown) => ({ deny: `threw: ${String(err)}` }))
  await trace($, 'keyboard-mode on', focused.deny ? `focus refused: ${focused.deny}` : 'focus moved to the keys field')
}

/** One input from a button or the keyboard field. Ignored unless Claude is working. */
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

/** Claude just went idle: freeze every game clock, saved exactly as it is. */
const wentIdle = async ($: EngineInterface) => {
  await mutate($, M.pauseAll)
  $.ui.status(undefined)
}

const RUNNING = new Set(['pending', 'running'])

/**
 * Workflow runs this session has in flight, one each. $.agent.list() leaves a
 * workflow's agents out, so a run counts from the Workflow call that starts
 * it (or its first agent, for a run that began before this build loaded),
 * and the engine's own list of background work in flight, handed over
 * whenever Claude or one of its agents stops, corrects the count.
 */
let workflowsNow = 0
const isWorkflow = (task: { type: string }) => /workflow/i.test(task.type)

/** Recounts this session's running agents; the last one finishing is when Claude is done. */
const syncAgents = async ($: EngineInterface) => {
  const subagents = (await $.agent.list()).filter(a => RUNNING.has(a.status)).length
  const { before, after } = await transact($, (tx, now) => {
    const running = subagents + workflowsNow
    return running === tx.live.agents ? tx : M.agentsChanged(tx.live, tx.session, running, now)
  })
  if (before.live.agents === after.live.agents) return
  if (after.becameIdle) await wentIdle($)
  await trace($, 'agents', `${before.live.agents} -> ${after.live.agents}${workflowsNow > 0 ? ` (${M.plural(workflowsNow, 'workflow')})` : ''}${after.becameIdle ? ', Claude done' : ''}`)
  if (before.live.phase === 'idle' && after.live.phase !== 'idle') await scheduleOffer($)
}

const setWorkflows = async ($: EngineInterface, count: number, why: string) => {
  if (count !== workflowsNow) {
    const was = workflowsNow
    workflowsNow = count
    await trace($, 'workflows', `${was} -> ${count}: ${why}`)
  }
  await syncAgents($)
}

/** The engine's list of background work in flight (classic Stop, SubagentStop): how many workflows still run. */
const backgroundListed = async ($: EngineInterface, tasks: readonly { type: string }[] | undefined, why: string) => {
  if (!tasks) return
  const listed = tasks.filter(isWorkflow).length
  if (listed > 0) await trace($, 'background', `${why}: ${tasks.map(t => t.type).join(', ')}`)
  await setWorkflows($, listed, why)
}

/** Appends to the debug timeline (devTools only): the event and the state right after it. */
const trace = async ($: EngineInterface, event: string, note?: string): Promise<void> => {
  if (!devTools) return
  await serial(async () => {
    const live = await getLive($)
    const entry: TraceEntry = { at: await $.clock.now(), event, phase: live.phase, agents: live.agents, isTurnRunning: live.isTurnRunning, testMode: live.testMode, ...(note ? { note } : {}) }
    const log = ((await $.store.get(TRACE_KEY)) as TraceEntry[] | undefined) ?? []
    await $.store.set(TRACE_KEY, [...log, entry].slice(-80))
  })
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
      workflows: workflowsNow,
      paneOpen: await isPaneOpen($),
      save: { screen: save.screen, g2048: save.g2048 && { score: save.g2048.score, moves: save.g2048.moves }, mines: save.mines?.status ?? null, crossword: save.crossword?.puzzleId ?? null, scores: save.scores },
      timeline: (((await $.store.get(TRACE_KEY)) as TraceEntry[] | undefined) ?? []).slice(-25),
    }
    return JSON.stringify(result, null, 1)
}

export const register: Register = (on, options) => {
  devTools = options.devTools === true

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'games', description: 'Open the While-You-Wait arcade (playable while Claude works). /games test toggles test mode.', argumentHint: '[test]' })
    if (devTools) await $.tool.register({
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
    if ((await $.state.get(sessionRef)).version === 0) await $.state.set(sessionRef, (sessionNow = M.freshSession()))
    if ((await $.state.get(liveRef)).version === 0) await $.state.set(liveRef, (liveNow = M.freshLive()))
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
    await transact($, (tx, now) => ({ ...tx, live: M.turnStarted(tx.live, e.turnId, now) }))
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
    const { after } = await transact($, (tx, now) => M.turnCompleted(tx.live, tx.session, now, e.reason === 'answer'))
    if (after.becameIdle) await wentIdle($)
    else await mutate($, M.pauseAll) // your turn's over: freeze clocks until you play again
    await trace($, 'turn.complete', after.becameIdle ? "Claude's done" : `still busy: ${after.live.agents} agents`)
    return next(e)
  })

  // Observers, not guards: if one fails, whatever it watched goes on untouched.
  on('tool.call', async ($, e, next) => {
    if (devTools && String(e.tool) === DEBUG_TOOL) return { result: await debugTool($, e) } as Awaited<ReturnType<typeof next>>
    const path = (e as { file_path?: unknown; notebook_path?: unknown }).file_path ?? (e as { notebook_path?: unknown }).notebook_path
    await setSession($, t => M.toolCalled(t, String(e.tool), typeof path === 'string' ? path : undefined))
    if (String(e.tool) === 'AskUserQuestion') await attention($, 'AskUserQuestion')
    const ran = await next(e)
    // Any permission prompt or question for this call has been answered by now.
    await setLive($, M.attentionCleared)
    if (String(e.tool) === 'Agent' || String(e.tool) === 'Task') await syncAgents($).catch(() => undefined)
    // A Workflow call answers at once and its run goes on in the background.
    if (String(e.tool) === 'Workflow' && !ran.deny && !ran.isError) await setWorkflows($, workflowsNow + 1, 'Workflow called').catch(() => undefined)
    return ran
  }).catch(($, e, next) => next(e))

  // Never retried on failure, unlike the observers below: a second next(e) would start a second agent.
  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (e.workflow && spawned.agentId !== undefined && workflowsNow === 0) await setWorkflows($, 1, `workflow ${e.workflow.runId} agent started`).catch(() => undefined)
    return spawned
  })

  on('classic.Stop', async ($, e, next) => {
    // No list at all reads as nothing in flight, so a count can never stick once Claude stops.
    await backgroundListed($, e.background_tasks ?? [], 'Claude stopped').catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStop', async ($, e, next) => {
    await backgroundListed($, e.background_tasks, `agent ${e.agent_id} stopped`).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', async ($, e, next) => {
    await attention($, `permission: ${e.tool_name}`)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' || e.notification_type === 'elicitation_dialog') await attention($, e.notification_type)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const live = await drawnLive($)
    const save = await getSave($)
    const session = await drawnSession($)
    return drawPane(
      { Box: els.Box, Text: els.Text, Button: els.Button, ...('Svg' in els ? { Svg: els.Svg } : {}), ...('Input' in els ? { Input: els.Input } : {}) },
      // The handheld is drawn where it was checked live: the desktop.
      { live, save, session, now: await $.clock.now(), puzzles: PUZZLES, handheld: e.surface === 'desktop' },
      {
        send: input => void send($, input),
        jumpBack: () => void $.ui.close({ id: PANE }),
        typed: value => void typedInBox($, value, false),
        entered: value => void typedInBox($, value, true),
        toggleKeyboard: () => void toggleKeyboard($),
      },
    )
  })
}
