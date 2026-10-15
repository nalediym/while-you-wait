// Drives the pane through each state and prints its drawn tree (Client LCDs
// inlined) as `@@SNAP <name> <json>` lines. scripts/preview.ts runs this as a
// test in a scratch copy of the mod and renders the trees to HTML.

import { mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { harness } from './harness'

const T0 = new Date(2026, 9, 15, 15, 30).getTime()
const COLS = Number('__COLS__')

const inline = async (ui: { drawn: (s?: { in: string }) => Promise<unknown> }, node: unknown): Promise<unknown> => {
  if (Array.isArray(node)) return Promise.all(node.map(n => inline(ui, n)))
  if (typeof node !== 'object' || node === null) return node
  const n = node as { type?: string; props?: { key?: string }; children?: unknown }
  if (n.type === 'Client' && n.props?.key) return { type: 'Lcd', children: [await inline(ui, await ui.drawn({ in: n.props.key }))] }
  return { ...n, children: await inline(ui, n.children) }
}

test('snapshots', { timeoutMs: 20_000 }, async ($: Engine, on) => {
  const clock = mock.clock(on, { now: T0 })
  harness(on, {
    'save-v1': {
      v: 1, screen: 'menu', menuCursor: 0, flagMode: false, g2048: null, mines: null, crossword: null,
      scores: { best2048Tile: 512, best2048Score: 6140, minesFastestMs: [72_000, 95_000], crosswordsSolved: ['cw-001', 'cw-002', 'cw-003'] },
      stats: { day: '2026-10-15', today: { turns: 13, turnsWhileWaited: 5, workMs: 4_380_000, toolCalls: 342, filesEdited: 27, boardsCleared: 6 }, allTime: { turns: 211, turnsWhileWaited: 88, workMs: 61_000_000, toolCalls: 6120, filesEdited: 402, boardsCleared: 97 }, todayFiles: [] },
    },
  })
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true, startedAt: T0 } as never)
  const ui = await $.ui.mount({
    plugin: 'while-you-wait', surface: 'desktop', component: 'Pane', requestId: 'arcade',
    props: { title: 'While You Wait', isFocused: false, bodyColumns: COLS, placement: 'dock', scroll: { top: 0, bodyRows: 60 }, view: {} } as never,
    viewport: { columns: COLS + 4, rows: 60, isFullscreen: true },
  })
  const snap = async (name: string) => console.log(`@@SNAP ${name} ${JSON.stringify(await inline(ui, await ui.drawn()))}`)

  await snap('resting')
  await $.turn.start({ text: 'go', turnId: 't1' })
  await snap('menu')
  await ui.press({ key: 'open-2048' })
  for (const key of ['left', 'up', 'left', 'down', 'right', 'up', 'left', 'left', 'up', 'down', 'left', 'up']) await ui.key({ key, in: 'lcd-2048' })
  await snap('2048')
  await ui.press({ key: 'btn-select' })
  await ui.press({ key: 'open-mines' })
  await ui.press({ key: 'btn-a' })
  await ui.key({ key: 'right', in: 'lcd-mines' })
  await ui.key({ key: 'right', in: 'lcd-mines' })
  await ui.key({ key: 'f', in: 'lcd-mines' })
  await clock.advance(42_000)
  await ui.key({ key: 'up', in: 'lcd-mines' })
  await snap('mines')
  await ui.press({ key: 'btn-select' })
  await ui.press({ key: 'open-crossword' })
  for (const key of ['s', 'h', 'o']) await ui.key({ key, in: 'lcd-crossword' })
  await snap('crossword')
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} } as never)
  await snap('needs-you')
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await snap('done')
})
