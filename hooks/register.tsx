// while-you-wait: a Game Boy-style arcade in a side pane that is playable
// only while Claude works. This file only wires engine events to the pure
// model (model.ts) and the drawing (ui/pane.tsx).

import { update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Lcd, Live, Save } from '../types'
import { PUZZLES } from './games/puzzles'
import type { Input } from './model'
import * as M from './model'
import { keyToInput } from './ui/keys'
import { drawPane } from './ui/pane'
import type { ScreenPost } from './ui/screen'
import type { PadPost } from './ui/pad'

const PANE = 'arcade'
const TITLE = 'While You Wait'
const STORE_KEY = 'save-v1'

const liveRef = { plugin: 'while-you-wait', key: 'live' } as const
const saveRef = { plugin: 'while-you-wait', key: 'save' } as const
const lcdRef = { plugin: 'while-you-wait', key: 'lcd' } as const

const getLive = async ($: EngineInterface): Promise<Live> => (await $.state.get(liveRef)).value ?? M.freshLive()
const getSave = async ($: EngineInterface): Promise<Save> => (await $.state.get(saveRef)).value ?? M.freshSave(await $.clock.now())

const setLive = ($: EngineInterface, f: (l: Live) => Live) => update($, liveRef, l => f(l ?? M.freshLive()))
const setSave = async ($: EngineInterface, f: (s: Save) => Save, persist = false) => {
  const now = await $.clock.now()
  await update($, saveRef, s => f(s ?? M.freshSave(now)))
  if (persist) await $.store.set(STORE_KEY, await getSave($))
}

const isPaneOpen = async ($: EngineInterface) => (await $.ui.panes()).some(p => p.id === PANE)

/** Offers the pane once per long turn: opens it beside the transcript, never taking focus. */
const offer = async ($: EngineInterface) => {
  const live = await getLive($)
  if (!M.shouldOffer(live, await $.clock.now())) return
  await setLive($, l => ({ ...l, offeredTurnId: live.turnId }))
  if (await isPaneOpen($)) return
  const opened = await $.ui.open({ id: PANE, title: TITLE })
  if (!opened.isPlaced) $.ui.status("🎮 Claude's on a long one — /games while you wait")
}

const scheduleOffer = async ($: EngineInterface) => {
  const live = await getLive($)
  if (live.phase !== 'working' || live.turnStartedAt === null || live.offeredTurnId === live.turnId) return
  const wait = Math.max(0, live.turnStartedAt + M.OFFER_AFTER_MS - (await $.clock.now()))
  $.clock.after(wait, () => void offer($))
}

/** One input from a key, a tap or a button. Ignored unless Claude is working. */
const send = async ($: EngineInterface, input: Input) => {
  const live = await getLive($)
  const save = await getSave($)
  const next = M.act(save, input, live, await $.clock.now(), PUZZLES)
  if (next === save) return
  await setSave($, () => next, true)
  if (!live.playedThisTurn) await setLive($, l => ({ ...l, playedThisTurn: true }))
}

const attention = async ($: EngineInterface) => {
  const now = await $.clock.now()
  await setLive($, M.needsAttention)
  await setSave($, s => M.pauseAll(s, now), true)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'games', description: 'Open the While-You-Wait arcade (playable while Claude works)' })
    // A hot reload fires this again mid-session: keep what $.state already holds.
    if ((await $.state.get(saveRef)).version === 0) {
      const now = await $.clock.now()
      await $.state.set(saveRef, M.loadSave(await $.store.get(STORE_KEY), now))
    }
    if ((await $.state.get(liveRef)).version === 0) await $.state.set(liveRef, M.freshLive())
    else await scheduleOffer($)
    return next(e)
  })

  on('command.run', { command: 'games' }, async $ => {
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
    $.ui.status(undefined)
    await scheduleOffer($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e) // a subagent's turn, not yours
    const now = await $.clock.now()
    const live = await getLive($)
    const save = await getSave($)
    const done = M.turnCompleted(live, save, now, e.reason === 'answer')
    await $.state.set(liveRef, done.live)
    await $.state.set(saveRef, done.save)
    await $.store.set(STORE_KEY, done.save)
    $.ui.status(undefined)
    return next(e)
  })

  // Observers, not guards: if one fails, whatever it watched goes on untouched.
  on('tool.call', async ($, e, next) => {
    const now = await $.clock.now()
    const path = (e as { file_path?: unknown; notebook_path?: unknown }).file_path ?? (e as { notebook_path?: unknown }).notebook_path
    await setSave($, s => M.toolCalled(s, String(e.tool), typeof path === 'string' ? path : undefined, now))
    if (String(e.tool) === 'AskUserQuestion') await attention($)
    const ran = await next(e)
    // Any permission prompt or question for this call has been answered by now.
    await setLive($, M.attentionCleared)
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
    const onScreen = post.type === 'press' && ['lcd', 'cell', 'row', 'header'].includes(post.press.kind)
    if (onScreen && live.phase === 'attention') {
      await $.ui.close({ id: PANE }) // the "go answer Claude" box
      return next(e)
    }
    const input: Input | undefined =
      post.type === 'press'
        ? M.pressToInput(save.screen, post.press, post.button)
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
    const lcd: Lcd = (await $.state.get(lcdRef)).value ?? { hasFailed: false }
    return drawPane(
      { Box: els.Box, Text: els.Text, Button: els.Button, ...('Client' in els ? { Client: els.Client } : {}), ...('Svg' in els ? { Svg: els.Svg } : {}) },
      { live, save, now: await $.clock.now(), puzzles: PUZZLES, useClient: e.surface === 'desktop' && !lcd.hasFailed },
      {
        send: input => void send($, input),
        jumpBack: () => void $.ui.close({ id: PANE }),
      },
    )
  })
}
