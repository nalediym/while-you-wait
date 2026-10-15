// while-you-wait: a Game Boy-style arcade in a side pane that is playable
// only while Claude works. This file only wires engine events to the pure
// model (model.ts) and the drawing (ui/pane.tsx).

import { update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ClickLog, Lcd, Live, Pressed, Save, SessionStats } from '../types'
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
const pressedRef = { plugin: 'while-you-wait', key: 'pressed' } as const
const CLICK_LOG_KEY = 'click-log' // the last clicks, raw, for diagnosing taps that land wrong
const AGENT_POLL_MS = 3_000
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
  if (await isPaneOpen($)) return
  const opened = await $.ui.open({ id: PANE, title: TITLE })
  if (!opened.isPlaced) $.ui.status("🎮 Claude's on a long one — /games while you wait")
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
  await applySettled($, M.agentsChanged(live, await getSession($), running, await $.clock.now()))
  if (wasIdle && running > 0) await scheduleOffer($)
}

/** A drawn control shows pushed-in for a moment after a click. */
const PRESSABLE = new Set(['up', 'down', 'left', 'right', 'a', 'b', 'select', 'start'])
const flashPressed = async ($: EngineInterface, id: string) => {
  const at = await $.clock.now()
  await $.state.set(pressedRef, { id, at } satisfies Pressed)
  $.clock.after(160, async () => {
    if ((await $.state.get(pressedRef)).value?.at === at) await $.state.set(pressedRef, null)
  })
}

const logClick = async ($: EngineInterface, entry: Omit<ClickLog, 'at'>) => {
  const log = ((await $.store.get(CLICK_LOG_KEY)) as ClickLog[] | undefined) ?? []
  await $.store.set(CLICK_LOG_KEY, [...log, { at: await $.clock.now(), ...entry }].slice(-30))
}

const attention = async ($: EngineInterface) => {
  await setLive($, M.needsAttention)
  await mutate($, M.pauseAll)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'games', description: 'Open the While-You-Wait arcade (playable while Claude works)' })
    // A hot reload fires this again mid-session: keep what $.state already holds.
    if ((await $.state.get(saveRef)).version === 0) await $.state.set(saveRef, M.loadSave(await readStore($)))
    if ((await $.state.get(sessionRef)).version === 0) await $.state.set(sessionRef, M.freshSession())
    if ((await $.state.get(liveRef)).version === 0) await $.state.set(liveRef, M.freshLive())
    else await scheduleOffer($)
    // Background agents end on their own time: recount them every few seconds while any run.
    $.clock.every(AGENT_POLL_MS, async () => {
      if ((await getLive($)).agents > 0) await syncAgents($).catch(() => undefined)
    })
    return next(e)
  })

  on('command.run', { command: 'games' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: TITLE })
    const live = await getLive($)
    return {
      text:
        live.phase === 'working'
          ? 'Arcade open. Claude is working: play away.'
          : "Arcade open. Claude's resting, so it's locked. Go ship something.",
    }
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await setLive($, l => M.turnStarted(l, e.turnId, now))
    await refresh($)
    $.ui.status(undefined)
    await scheduleOffer($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      // An agent's turn, not yours: it may have been the last one still running.
      await syncAgents($).catch(() => undefined)
      return next(e)
    }
    await syncAgents($).catch(() => undefined) // agents still running keep the arcade open
    const done = M.turnCompleted(await getLive($), await getSession($), await $.clock.now(), e.reason === 'answer')
    await applySettled($, done)
    if (!done.becameIdle) await mutate($, M.pauseAll) // your turn's over: freeze clocks until you play again
    return next(e)
  })

  // Observers, not guards: if one fails, whatever it watched goes on untouched.
  on('tool.call', async ($, e, next) => {
    const path = (e as { file_path?: unknown; notebook_path?: unknown }).file_path ?? (e as { notebook_path?: unknown }).notebook_path
    await setSession($, t => M.toolCalled(t, String(e.tool), typeof path === 'string' ? path : undefined))
    if (String(e.tool) === 'AskUserQuestion') await attention($)
    const ran = await next(e)
    // Any permission prompt or question for this call has been answered by now.
    await setLive($, M.attentionCleared)
    if (String(e.tool) === 'Agent' || String(e.tool) === 'Task') await syncAgents($).catch(() => undefined)
    return ran
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', async ($, e, next) => {
    await attention($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' || e.notification_type === 'elicitation_dialog') await attention($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.message', { requestId: PANE }, async ($, e, next) => {
    const post = e.data as ScreenPost | PadPost
    const save = await getSave($)
    const live = await getLive($)
    if (post.type === 'press') {
      await logClick($, { press: post.press ? post.press.kind : 'nothing', ...post.raw })
      if (!post.press) return next(e)
      const id = post.press.kind === 'dir' ? post.press.dir : post.press.kind
      if (PRESSABLE.has(id)) await flashPressed($, id)
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
    const pressed = (await $.state.get(pressedRef)).value ?? null
    const lcd: Lcd = (await $.state.get(lcdRef)).value ?? { hasFailed: false }
    return drawPane(
      { Box: els.Box, Text: els.Text, Button: els.Button, ...('Client' in els ? { Client: els.Client } : {}), ...('Svg' in els ? { Svg: els.Svg } : {}) },
      { live, save, session, pressed: pressed?.id ?? null, now: await $.clock.now(), puzzles: PUZZLES, useClient: e.surface === 'desktop' && !lcd.hasFailed },
      {
        send: input => void send($, input),
        jumpBack: () => void $.ui.close({ id: PANE }),
      },
    )
  })
}
