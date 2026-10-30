import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { worldDir } from '../paths'
import type { GenResult } from './types'

export type WorldApp = {
  id: string
  name: string
  purpose: string
  dataShapes: string[]
}

export type WorldEntity = {
  name: string
  kind: string
  description: string
  appId?: string
}

export type WorldView = {
  appId: string
  viewId: string
  intent: string
  title?: string
}

export type WorldLog = {
  at: string
  intent: string
  kind: string
  appId?: string
  summary: string
}

export type CacheEntry = {
  key: string
  appId?: string
  kind: string
  result: GenResult
  at: string
}

type WorldState = {
  apps: Record<string, WorldApp>
  entities: WorldEntity[]
  views: WorldView[]
  log: WorldLog[]
}

const EMPTY: WorldState = { apps: {}, entities: [], views: [], log: [] }

const statePath = () => path.join(worldDir, 'state.json')
const cachePath = () => path.join(worldDir, 'cache.json')

let chain: Promise<void> = Promise.resolve()

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn)
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function readState(): Promise<WorldState> {
  try {
    const raw = JSON.parse(await fs.readFile(statePath(), 'utf8')) as Partial<WorldState>
    return {
      apps: raw.apps && typeof raw.apps === 'object' ? raw.apps : {},
      entities: Array.isArray(raw.entities) ? raw.entities : [],
      views: Array.isArray(raw.views) ? raw.views : [],
      log: Array.isArray(raw.log) ? raw.log : [],
    }
  } catch {
    return { apps: {}, entities: [], views: [], log: [] }
  }
}

async function writeState(state: WorldState): Promise<void> {
  await fs.mkdir(worldDir, { recursive: true })
  const next: WorldState = {
    apps: state.apps,
    entities: state.entities.slice(-200),
    views: state.views.slice(-200),
    log: state.log.slice(-200),
  }
  await fs.writeFile(statePath(), JSON.stringify(next, null, 2))
}

async function readCache(): Promise<CacheEntry[]> {
  try {
    const raw = JSON.parse(await fs.readFile(cachePath(), 'utf8')) as CacheEntry[]
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

async function writeCache(entries: CacheEntry[]): Promise<void> {
  await fs.mkdir(worldDir, { recursive: true })
  await fs.writeFile(cachePath(), JSON.stringify(entries.slice(-400)))
}

export function cacheKeyOf(input: { appId?: string; kind: string; intent: string; context?: unknown; key?: string }): string {
  if (input.key && input.key.trim()) return input.key.trim().slice(0, 200)
  const scope = scopeOf(input.context)
  const intent = input.intent.trim().toLowerCase().replace(/\s+/g, ' ')
  return createHash('sha256')
    .update([input.appId || '', input.kind, intent, scope].join('\n'))
    .digest('hex')
    .slice(0, 32)
}

function scopeOf(context: unknown): string {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return ''
  if (!('scope' in context)) return ''
  return stableString((context as { scope?: unknown }).scope)
}

function stableString(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? ''
  if (Array.isArray(value)) return `[${value.map((item) => stableString(item)).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableString(record[key])}`).join(',')}}`
}

export function getCached(key: string): Promise<GenResult | null> {
  return locked(async () => {
    const hit = (await readCache()).find((entry) => entry.key === key)
    return hit ? hit.result : null
  })
}

export function putCached(entry: CacheEntry): Promise<void> {
  return locked(async () => {
    const entries = (await readCache()).filter((item) => item.key !== entry.key)
    entries.push(entry)
    await writeCache(entries)
  })
}

/** The first screen changed: the next screens cached from it no longer follow. */
export function forgetCached(appId: string): Promise<void> {
  return locked(async () => {
    await writeCache((await readCache()).filter((entry) => entry.appId !== appId || entry.kind === 'auto'))
  })
}

export function forgetApp(appId: string): Promise<void> {
  return locked(async () => {
    const state = await readState()
    delete state.apps[appId]
    state.entities = state.entities.filter((entity) => entity.appId !== appId)
    state.views = state.views.filter((view) => view.appId !== appId)
    await writeState(state)
    const cache = (await readCache()).filter((entry) => entry.appId !== appId)
    await writeCache(cache)
  })
}

export function rememberApp(app: WorldApp): Promise<void> {
  return locked(async () => {
    const state = await readState()
    state.apps[app.id] = app
    await writeState(state)
  })
}

export function rememberView(view: WorldView): Promise<void> {
  return locked(async () => {
    const state = await readState()
    state.views = state.views.filter((item) => !(item.appId === view.appId && item.viewId === view.viewId))
    state.views.push(view)
    await writeState(state)
  })
}

export function rememberLog(entry: WorldLog): Promise<void> {
  return locked(async () => {
    const state = await readState()
    state.log.push(entry)
    await writeState(state)
  })
}

export async function viewsFor(appId: string): Promise<WorldView[]> {
  const state = await readState()
  return state.views.filter((view) => view.appId === appId)
}

export type WorldDelta = {
  summary?: { purpose?: string; dataShapes?: string[] }
  entities?: { name?: string; kind?: string; description?: string }[]
}

export function mergeDelta(appId: string, name: string, delta: WorldDelta | null, mode: 'app' | 'view' = 'app'): Promise<void> {
  return locked(async () => {
    const state = await readState()
    const current = state.apps[appId] || { id: appId, name, purpose: '', dataShapes: [] }
    current.name = name || current.name
    if (delta?.summary?.purpose && (mode === 'app' || !current.purpose)) {
      current.purpose = String(delta.summary.purpose).slice(0, 280)
    }
    if (Array.isArray(delta?.summary?.dataShapes)) {
      const merged = [...current.dataShapes]
      for (const item of delta.summary.dataShapes) {
        if (typeof item !== 'string' || !item.trim()) continue
        const key = item.trim().slice(0, 40)
        if (!merged.includes(key)) merged.push(key)
      }
      current.dataShapes = merged.slice(0, 12)
    }
    state.apps[appId] = current
    for (const entity of delta?.entities || []) {
      if (!entity || typeof entity.name !== 'string' || !entity.name.trim()) continue
      const key = entity.name.trim().toLowerCase()
      const next: WorldEntity = {
        name: entity.name.trim().slice(0, 80),
        kind: typeof entity.kind === 'string' ? entity.kind.slice(0, 40) : 'other',
        description: typeof entity.description === 'string' ? entity.description.slice(0, 240) : '',
        appId,
      }
      const index = state.entities.findIndex((item) => item.name.toLowerCase() === key && item.appId === appId)
      if (index >= 0) state.entities[index] = next
      else state.entities.push(next)
    }
    await writeState(state)
  })
}

const CAP = 12_000

export async function worldDigest(focus?: { appId?: string; intent?: string }): Promise<string> {
  const state = await readState()
  const lines: string[] = []
  const intentWords = words(focus?.intent || '')
  const focusApp = focus?.appId ? state.apps[focus.appId] : undefined
  if (focusApp) {
    lines.push(formatApp(focusApp))
    const views = state.views.filter((view) => view.appId === focusApp.id)
    if (views.length) lines.push(`Screens: ${views.map((view) => view.title || view.intent).slice(0, 12).join('; ')}`)
  }
  const related = state.entities.filter((entity) => entity.appId === focus?.appId || shares(entity, intentWords))
  const rest = state.entities.filter((entity) => !related.includes(entity))
  for (const entity of related.slice(0, 24)) lines.push(formatEntity(entity))
  for (const app of Object.values(state.apps)) {
    if (app.id === focusApp?.id) continue
    lines.push(formatApp(app))
  }
  for (const entity of rest.slice(0, 16)) lines.push(formatEntity(entity))
  for (const entry of state.log.slice(-10).reverse()) {
    lines.push(`Earlier: ${entry.intent} → ${entry.summary}`)
  }
  const text = lines.join('\n')
  if (!text) return 'The world is empty. This is the first thing in it.'
  return text.length > CAP ? `${text.slice(0, CAP)}\n…` : text
}

export async function worldSnapshot(): Promise<{ digest: string; apps: WorldApp[]; entities: WorldEntity[]; views: WorldView[]; log: WorldLog[] }> {
  const state = await readState()
  return {
    digest: await worldDigest(),
    apps: Object.values(state.apps),
    entities: state.entities,
    views: state.views,
    log: state.log.slice(-40),
  }
}

function formatApp(app: WorldApp): string {
  const shapes = app.dataShapes.length ? ` Stores: ${app.dataShapes.join(', ')}.` : ''
  return `App ${app.name} (${app.id}): ${app.purpose || 'no summary yet.'}${shapes}`
}

function formatEntity(entity: WorldEntity): string {
  const owner = entity.appId ? `, from ${entity.appId}` : ''
  return `Entity ${entity.name} (${entity.kind}${owner}): ${entity.description}`
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2),
  )
}

function shares(entity: WorldEntity, intentWords: Set<string>): boolean {
  if (!intentWords.size) return false
  const bag = words(`${entity.name} ${entity.description} ${entity.kind}`)
  for (const word of intentWords) if (bag.has(word)) return true
  return false
}

export { EMPTY }
