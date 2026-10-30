import fs from 'node:fs/promises'
import path from 'node:path'
import { nanoid } from 'nanoid'
import { getApp, listApps } from '../apps/registry'
import { appsDir, workspacesDir, worldDir } from '../paths'
import { clearAuthBlock } from './auth'
import { settingsFor, timeoutFor } from './config'
import * as persist from './persist'
import { parseScreenAnswer } from './answer'
import { buildPrompt, type PromptRequest } from './prompts'
import { getProvider } from './providers/load'
import { cancelAll, dropJobs, enqueue, flushPersist, jobForKey, silenceJobs, type JobContext } from './queue'
import { runProvider } from './runner'
import { GeneratorError, type GenKind, type GenResult, type SseEvent } from './types'
import { cacheKeyOf, forgetCached, getCached, mergeDelta, putCached, rememberLog, rememberView, worldDigest, worldSnapshot, type WorldDelta } from './world'

type GenBody = {
  appId?: string
  windowId?: string
  kind: 'auto' | 'app' | 'view'
  intent: string
  context?: unknown
  key?: string
  fresh?: boolean
}

export async function startCreate(prompt: string): Promise<string> {
  return enqueue({
    kind: 'create',
    prompt,
    interactive: false,
    run: (ctx) => runCreate(ctx, prompt),
  })
}

export async function startEdit(appId: string, prompt: string): Promise<string> {
  return enqueue({
    kind: 'edit',
    prompt,
    appId,
    interactive: false,
    run: (ctx) => runEdit(ctx, appId, prompt),
  })
}

export async function startRegenerate(appId: string): Promise<string> {
  const loaded = await getApp(appId)
  const prompt = loaded?.manifest.prompt || loaded?.manifest.name || appId
  return enqueue({
    kind: 'regenerate',
    prompt,
    appId,
    interactive: false,
    run: (ctx) => runRegenerate(ctx, appId),
  })
}

export async function startGen(body: GenBody): Promise<{ cached: true; result: GenResult } | { jobId: string }> {
  const key = cacheKeyOf({ appId: body.appId, kind: body.kind, intent: body.intent, context: body.context, key: body.key })
  const inflight = jobForKey(key)
  if (inflight) return { jobId: inflight }
  if (!body.fresh) {
    const hit = await getCached(key)
    if (hit) return { cached: true, result: hit }
    if (body.kind === 'auto') {
      const match = await matchExisting(body.intent)
      if (match) {
        const result: GenResult = { kind: 'app', appId: match }
        await putCached({ key, appId: match, kind: 'auto', result, at: new Date().toISOString() })
        return { cached: true, result }
      }
    }
  }
  const jobId = enqueue({
    kind: body.kind,
    prompt: body.intent,
    appId: body.appId,
    interactive: body.kind !== 'app',
    cacheKey: key,
    run: async (ctx) => {
      const result = await dispatchGen(ctx, body)
      await putCached({ key, appId: result.kind === 'app' ? result.appId : body.appId, kind: body.kind, result, at: new Date().toISOString() })
      return result
    },
  })
  return { jobId }
}

export async function revert(appId: string, version: number): Promise<AppResult> {
  const manifest = await persist.revertApp(appId, version)
  if (!manifest) return { error: 'version not found', status: 404 }
  await forgetCached(appId)
  return { manifest }
}

export async function resetEverything(): Promise<void> {
  silenceJobs(true)
  await cancelAll()
  await flushPersist()
  const provider = await getProvider()
  await provider.shutdown?.()
  dropJobs()
  clearAuthBlock()
  await fs.rm(path.dirname(appsDir), { recursive: true, force: true })
  await fs.mkdir(appsDir, { recursive: true })
  await fs.mkdir(workspacesDir, { recursive: true })
  await fs.mkdir(worldDir, { recursive: true })
  silenceJobs(false)
}

type AppResult = { manifest: import('../apps/types').AppManifest } | { error: string; status: number }

async function dispatchGen(ctx: JobContext, body: GenBody): Promise<GenResult> {
  if (body.kind === 'app') return runCreate(ctx, body.intent)
  if (body.kind === 'view') {
    if (!body.appId) throw new GeneratorError('view generation needs an appId')
    return runView(ctx, body.appId, body.intent, body.context)
  }
  return runAuto(ctx, body)
}

async function runCreate(ctx: JobContext, prompt: string): Promise<GenResult> {
  const id = await persist.allocateId(prompt)
  ctx.setAppId(id)
  try {
    const made = await generateScreen(ctx, {
      appId: id,
      kind: 'app',
      mode: 'create',
      intent: prompt,
    })
    const manifest = await persist.saveAppVersion({
      id,
      html: made.html,
      suggested: made.meta,
      kind: 'create',
      prompt,
    })
    await finishApp(id, manifest.name, manifest.description, prompt, 'app', made.meta)
    return { kind: 'app', appId: id, name: manifest.name, version: manifest.version }
  } catch (err) {
    await persist.discardReserved(id)
    throw err
  }
}

async function runEdit(ctx: JobContext, appId: string, prompt: string): Promise<GenResult> {
  const loaded = await requireGenerated(appId)
  ctx.setAppId(appId)
  const made = await generateScreen(ctx, {
    appId,
    kind: 'app',
    mode: 'edit',
    intent: prompt,
    currentHtml: loaded.html,
    appName: loaded.manifest.name,
  })
  const manifest = await persist.saveAppVersion({
    id: appId,
    html: made.html,
    suggested: made.meta,
    kind: 'edit',
    prompt,
    previous: loaded.manifest,
  })
  await forgetCached(appId)
  await finishApp(appId, manifest.name, manifest.description, prompt, 'edit', made.meta)
  return { kind: 'app', appId, name: manifest.name, version: manifest.version }
}

async function runRegenerate(ctx: JobContext, appId: string): Promise<GenResult> {
  const loaded = await requireGenerated(appId)
  const prompt = loaded.manifest.prompt || loaded.manifest.name
  ctx.setAppId(appId)
  const made = await generateScreen(ctx, {
    appId,
    kind: 'app',
    mode: 'regenerate',
    intent: prompt,
    appName: loaded.manifest.name,
  })
  const manifest = await persist.saveAppVersion({
    id: appId,
    html: made.html,
    suggested: made.meta,
    kind: 'regenerate',
    prompt,
    previous: loaded.manifest,
  })
  await forgetCached(appId)
  await finishApp(appId, manifest.name, manifest.description, prompt, 'regenerate', made.meta)
  return { kind: 'app', appId, name: manifest.name, version: manifest.version }
}

type ScreenContext = { from?: unknown; title?: unknown; shown?: unknown; values?: unknown }

/** The next screen: the one the person acted on, what it showed, and what they did. */
async function runView(ctx: JobContext, appId: string, intent: string, context?: unknown): Promise<GenResult> {
  const loaded = await getApp(appId)
  if (!loaded) throw new GeneratorError('App not found')
  const screen = (context && typeof context === 'object' ? context : {}) as ScreenContext
  const from = typeof screen.from === 'string' && screen.from !== 'root' ? screen.from : null
  const currentHtml = (from && (await persist.readScreen(appId, from))) || loaded.html
  const made = await generateScreen(ctx, {
    appId,
    kind: 'view',
    mode: 'view',
    intent,
    currentHtml,
    appName: loaded.manifest.name,
    screen: {
      title: typeof screen.title === 'string' ? screen.title : undefined,
      shown: typeof screen.shown === 'string' ? screen.shown.slice(0, 3000) : undefined,
      values: Array.isArray(screen.values) ? (screen.values as { field: string; value: string }[]).slice(0, 20) : undefined,
    },
  })
  const title = titleOf(typeof made.meta?.title === 'string' && made.meta.title.trim() ? made.meta.title : intent)
  const viewId = viewIdFor(title)
  await persist.saveView(appId, viewId, inheritStyles(currentHtml, made.html), { intent, title })
  await rememberView({ appId, viewId, intent, title })
  await mergeWorld(appId, loaded.manifest.name, { entities: made.meta?.entities }, undefined, 'view')
  await rememberLog({ at: new Date().toISOString(), intent, kind: 'view', appId, summary: title })
  return { kind: 'view', viewId, appId, title }
}

/** An existing app already matched in startGen. Anything else opens as a new app, without a routing turn. */
async function runAuto(ctx: JobContext, body: GenBody): Promise<GenResult> {
  if (body.appId && (await getApp(body.appId))) return runView(ctx, body.appId, body.intent, body.context)
  return runCreate(ctx, body.intent)
}

async function requireGenerated(appId: string) {
  const loaded = await getApp(appId)
  if (!loaded) throw new GeneratorError('App not found')
  return loaded
}

type ScreenRequest = {
  appId: string
  kind: 'app' | 'view'
  mode: PromptRequest['mode']
  intent: string
  currentHtml?: string
  appName?: string
  screen?: PromptRequest['screen']
}

/** One turn: the model replies with the meta json and the whole screen as HTML. Nothing to compile. */
async function generateScreen(ctx: JobContext, request: ScreenRequest): Promise<{ html: string; meta: Record<string, unknown> | null }> {
  const cwd = await persist.ensureWorkspace(request.appId)
  const prompt = await buildPrompt({
    kind: request.kind,
    mode: request.mode,
    intent: request.intent,
    appId: request.appId,
    appName: request.appName,
    currentHtml: request.currentHtml,
    screen: request.screen,
  })
  const output = await drive(ctx, { prompt, cwd, kind: request.kind })
  const answer = parseScreenAnswer(output)
  if (!answer.html) throw new GeneratorError('The answer had no screen')
  return { html: answer.html, meta: answer.meta }
}

async function drive(ctx: JobContext, input: { prompt: string; cwd: string; kind: GenKind }): Promise<string> {
  const provider = await getProvider()
  const settings = settingsFor(provider.id, input.kind)
  let output = ''
  let sawThinking = false
  for await (const event of runProvider(provider, {
    prompt: input.prompt,
    cwd: input.cwd,
    kind: input.kind,
    signal: ctx.signal,
    timeoutMs: timeoutFor(input.kind),
    model: settings.model,
    effort: settings.effort,
  })) {
    if (ctx.signal.aborted) throw new GeneratorError('Cancelled')
    if (event.type === 'error') throw new GeneratorError(event.message, Boolean(event.auth))
    if (event.type === 'end') {
      if (event.output) output = event.output
      continue
    }
    relay(ctx, event, () => {
      if (!sawThinking) {
        sawThinking = true
        return true
      }
      return false
    })
  }
  if (ctx.signal.aborted) throw new GeneratorError('Cancelled')
  return output
}

function relay(ctx: JobContext, event: SseEvent | { type: 'thinking' | 'text' | 'tool' | 'log' | 'status'; text: string }, markThinking: () => boolean): void {
  if (event.type === 'thinking') {
    if (markThinking()) ctx.emit({ type: 'status', step: 'thinking', text: 'Sketching the layout…' })
    ctx.emit({ type: 'thinking', text: event.text })
    return
  }
  if (event.type === 'tool') {
    ctx.emit({ type: 'tool', text: event.text })
    if (event.text.startsWith('Writing') || event.text.startsWith('Reading')) {
      ctx.emit({ type: 'status', step: 'writing', text: event.text })
    }
    return
  }
  if (event.type === 'status' || event.type === 'text' || event.type === 'log') ctx.emit(event)
}

async function finishApp(appId: string, name: string, description: string | undefined, intent: string, kind: string, meta: Record<string, unknown> | null): Promise<void> {
  await mergeWorld(appId, name, { entities: meta?.entities }, description, 'app')
  await rememberLog({ at: new Date().toISOString(), intent, kind, appId, summary: name })
}

async function mergeWorld(appId: string, name: string, world: unknown, description: string | undefined, mode: 'app' | 'view'): Promise<void> {
  const delta = normalizeDelta(world)
  if (mode === 'app' && description && !delta?.summary?.purpose) {
    const summary = { ...(delta?.summary || {}), purpose: description }
    await mergeDelta(appId, name, { ...(delta || {}), summary }, mode)
    return
  }
  await mergeDelta(appId, name, delta, mode)
}

function normalizeDelta(value: unknown): WorldDelta | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as WorldDelta
  return raw
}

export async function matchExisting(intent: string): Promise<string | null> {
  const needle = intent.trim().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (needle.length < 2) return null
  const [apps, world] = await Promise.all([listApps(), worldSnapshot()])
  const shapes = new Map(world.apps.map((app) => [app.id, app.dataShapes]))
  const scored = apps.map((app) => ({ id: app.id, score: scoreApp(needle, app.name, app.description || '', shapes.get(app.id) || []) }))
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (!best || best.score < 80) return null
  const second = scored[1]?.score ?? 0
  if (best.score - second < 15) return null
  return best.id
}

function scoreApp(intent: string, name: string, description: string, shapes: string[]): number {
  const normalized = name.toLowerCase().trim()
  if (intent === normalized) return 100
  if (shapes.some((shape) => sameStore(intent, shape))) return 92
  const nameWords = normalized.split(/[^a-z0-9]+/).filter((word) => word.length > 2)
  if (!nameWords.length) return 0
  const intentWords = new Set(intent.split(' ').filter((word) => word.length > 2))
  if (nameWords.every((word) => intentWords.has(word)) && intent.length <= normalized.length + 24) return 80
  if (description.toLowerCase().includes(intent) && intent.length > 8) return 60
  return 0
}

/** A single-word intent that is exactly another app’s storage key, plus a trailing s. */
function sameStore(intent: string, shape: string): boolean {
  const key = shape.trim().toLowerCase()
  if (key.length < 4) return false
  if (intent === key) return true
  if (intent.includes(' ')) return false
  return intent + 's' === key || intent + 'es' === key || key + 's' === intent || key + 'es' === intent
}

/** A next screen keeps the look of the one it came from: that screen's <style> blocks go first, unless repeated. */
function inheritStyles(from: string, html: string): string {
  const blocks = (from.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []).filter((block) => !html.includes(block))
  return blocks.length ? `${blocks.join('\n')}\n${html}` : html
}

function viewIdFor(intent: string): string {
  const base = persist.slugFromPrompt(intent).slice(0, 24)
  const suffix = nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, 'x')
  return `${base}-${suffix}`.replace(/^-/, 'v-')
}

function titleOf(intent: string): string {
  const line = intent.split('\n')[0]?.trim() || 'Screen'
  return line.length <= 48 ? line : `${line.slice(0, 47).trim()}…`
}

export async function describeWorld(): Promise<Awaited<ReturnType<typeof worldDigest>>> {
  return worldDigest()
}
