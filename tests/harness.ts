// A stand-in for the engine beneath the plugin in tests: sessions, commands,
// turns and panes answer as a desktop session would, and every pane the
// plugin opens or closes is recorded so a test can assert on it.

import type { AgentInfo, On, UiPane } from 'claude-code'

export type Harness = {
  opened: string[]
  closed: string[]
  status: (string | undefined)[]
  store: Map<string, unknown>
  /** This session's agents, as $.agent.list() answers: set a status to start or finish one. */
  agents: AgentInfo[]
}

/** `stored`: what $.store holds when the session starts (a previous session's save). */
export const harness = (on: On, stored: Record<string, unknown> = {}): Harness => {
  const h: Harness = { opened: [], closed: [], status: [], store: new Map(Object.entries(stored)), agents: [] }
  on('store.get', (_$, e) => ({ value: JSON.parse(JSON.stringify(h.store.get(e.key) ?? null)) ?? undefined }))
  on('store.set', (_$, e) => {
    h.store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  const panes = new Map<string, UiPane>()
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.status', (_$, e) => {
    h.status.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_$, e) => {
    h.opened.push(e.id)
    panes.set(e.id, { id: e.id, title: e.title ?? e.id, isShown: true, isFocused: false, isPlaced: true })
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_$, e) => {
    h.closed.push(e.id)
    panes.delete(e.id)
    return { value: undefined }
  })
  on('classic.PermissionRequest', () => ({}))
  on('classic.Notification', () => ({}))
  on('agent.list', () => ({ value: h.agents.map(a => ({ ...a })) }))
  on('ui.panes', () => ({ value: [...panes.values()] }))
  return h
}
