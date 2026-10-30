import { nanoid } from 'nanoid'
import type { PersistedScreen } from '../../../../runtime/protocol'
import { postToWindow, queueGenerative } from '../bridge/useWindowBridge'
import { startGeneration } from '../generation'
import { useShell } from '../store'

export type WorldView = { appId: string; viewId: string; intent: string; title?: string }
export type WorldEntity = { name: string; kind: string; description: string; appId?: string }

export type WorldIndex = { views: WorldView[]; entities: WorldEntity[] }

const empty: WorldIndex = { views: [], entities: [] }
let cache: { at: number; index: WorldIndex } | null = null
let flight: Promise<WorldIndex> | null = null

/** Views and entities for Spotlight. The digest stays on the server. */
export function loadWorld(): Promise<WorldIndex> {
  if (cache && Date.now() - cache.at < 4000) return Promise.resolve(cache.index)
  if (flight) return flight
  flight = fetch('/api/world')
    .then((res) => (res.ok ? res.json() : null))
    .then((body: { views?: unknown; entities?: unknown } | null) => {
      const index = {
        views: Array.isArray(body?.views) ? body.views.filter(isView) : [],
        entities: Array.isArray(body?.entities) ? body.entities.filter(isEntity) : [],
      }
      cache = { at: Date.now(), index }
      return index
    })
    .catch(() => empty)
    .finally(() => {
      flight = null
    })
  return flight
}

/** Open the app and push this generated screen onto its stack. */
export function openPlace(appId: string, view: WorldView): void {
  const shell = useShell.getState()
  if (!shell.apps.some((app) => app.id === appId)) return
  const wasOpen = shell.windows.some((win) => win.appId === appId && win.phase === 'open')
  shell.openApp(appId)
  const win = useShell.getState().windows.find((item) => item.appId === appId && item.phase !== 'closing')
  if (!win) return
  const title = view.title?.trim() || view.intent
  if (wasOpen && postToWindow(win.id, { type: 'screens.push', payload: { viewId: view.viewId, title, intent: view.intent } })) return
  if (win.screens.some((screen) => screen.viewId === view.viewId)) return
  const screen: PersistedScreen = { id: nanoid(8), title, viewId: view.viewId, intent: view.intent }
  shell.setWindowScreens(win.id, [...win.screens, screen])
}

/** Open the owning app and ask it to generate this entity, or start a new app when it has no owner. */
export function openThing(entity: WorldEntity): void {
  const shell = useShell.getState()
  const app = entity.appId ? shell.apps.find((item) => item.id === entity.appId) : undefined
  const intent = entity.name.trim()
  if (!app || !intent) {
    startGeneration(thingPrompt(entity))
    return
  }
  const wasOpen = shell.windows.some((win) => win.appId === app.id && win.phase === 'open')
  shell.openApp(app.id)
  const win = useShell.getState().windows.find((item) => item.appId === app.id && item.phase !== 'closing')
  if (!win) return
  const context = { entity: { name: entity.name, kind: entity.kind, description: entity.description } }
  if (wasOpen && postToWindow(win.id, { type: 'generative.open', payload: { intent, context } })) return
  queueGenerative(win.id, intent, context)
}

function thingPrompt(entity: WorldEntity): string {
  const kind = entity.kind ? ` (${entity.kind})` : ''
  const description = entity.description ? ` — ${entity.description}` : ''
  return `${entity.name}${kind}${description}`.trim()
}

function isView(value: unknown): value is WorldView {
  if (!value || typeof value !== 'object') return false
  const view = value as WorldView
  return Boolean(view.appId && view.viewId && view.intent)
}

function isEntity(value: unknown): value is WorldEntity {
  if (!value || typeof value !== 'object') return false
  const entity = value as WorldEntity
  return Boolean(entity.name)
}
