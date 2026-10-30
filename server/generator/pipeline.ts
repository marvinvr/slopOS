import fs from 'node:fs/promises'
import path from 'node:path'
import { nanoid } from 'nanoid'
import { compileApp } from '../apps/compile'
import { getApp, listApps } from '../apps/registry'
import type { CompileError } from '../apps/types'
import { appsDir, storageDir, workspacesDir, worldDir } from '../paths'
import { clearAuthBlock } from './auth'
import { settingsFor, timeoutFor } from './config'
import * as persist from './persist'
import { buildPrompt, type PromptRequest } from './prompts'
import { getProvider } from './providers/load'
import { cancelAll, dropJobs, enqueue, flushPersist, jobForKey, silenceJobs, type JobContext } from './queue'
import { runProvider } from './runner'
import { parseJsonText, ROUTE_SCHEMA, strictOutputSchema, validateJson } from './schema'
import { clearSessions, loadSession } from './sessions'
import { GeneratorError, type GenKind, type GenResult, type SseEvent } from './types'
import { cacheKeyOf, getCached, mergeDelta, putCached, rememberLog, rememberView, viewsFor, worldDigest, worldSnapshot, type WorldDelta } from './world'

type GenBody = {
  appId?: string
  windowId?: string
  kind: 'auto' | 'app' | 'view' | 'content'
  intent: string
  context?: unknown
  schema?: Record<string, unknown>
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

export async function startFix(appId: string, error: string): Promise<string> {
  return enqueue({
    kind: 'fix',
    prompt: error,
    appId,
    interactive: false,
    run: (ctx) => runFix(ctx, appId, error),
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
  return { manifest }
}

export async function resetEverything(): Promise<void> {
  silenceJobs(true)
  await cancelAll()
  await flushPersist()
  const provider = await getProvider()
  await provider.shutdown?.()
  await clearSessions()
  dropJobs()
  clearAuthBlock()
  await fs.rm(path.dirname(appsDir), { recursive: true, force: true })
  await fs.mkdir(appsDir, { recursive: true })
  await fs.mkdir(storageDir, { recursive: true })
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
  if (body.kind === 'content') return runContent(ctx, body)
  return runAuto(ctx, body)
}

async function runCreate(ctx: JobContext, prompt: string): Promise<GenResult> {
  const id = await persist.allocateId(prompt)
  ctx.setAppId(id)
  try {
    const made = await generateSource(ctx, {
      appId: id,
      kind: 'app',
      mode: 'create',
      intent: prompt,
      freshSession: true,
    })
    const manifest = await persist.saveAppVersion({
      id,
      source: made.source,
      suggested: made.manifest,
      kind: 'create',
      prompt,
    })
    await finishApp(id, manifest.name, manifest.description, prompt, 'app', made.world, made.source)
    return { kind: 'app', appId: id, name: manifest.name, version: manifest.version }
  } catch (err) {
    await persist.discardReserved(id)
    throw err
  }
}

async function runEdit(ctx: JobContext, appId: string, prompt: string): Promise<GenResult> {
  const loaded = await requireGenerated(appId)
  ctx.setAppId(appId)
  const made = await generateSource(ctx, {
    appId,
    kind: 'app',
    mode: 'edit',
    intent: prompt,
    currentSource: loaded.source,
    appName: loaded.manifest.name,
  })
  const manifest = await persist.saveAppVersion({
    id: appId,
    source: made.source,
    suggested: made.manifest,
    kind: 'edit',
    prompt,
    previous: loaded.manifest,
  })
  await finishApp(appId, manifest.name, manifest.description, prompt, 'edit', made.world, made.source)
  return { kind: 'app', appId, name: manifest.name, version: manifest.version }
}

async function runRegenerate(ctx: JobContext, appId: string): Promise<GenResult> {
  const loaded = await requireGenerated(appId)
  const prompt = loaded.manifest.prompt || loaded.manifest.name
  ctx.setAppId(appId)
  const made = await generateSource(ctx, {
    appId,
    kind: 'app',
    mode: 'regenerate',
    intent: prompt,
    freshSession: true,
    appName: loaded.manifest.name,
  })
  const manifest = await persist.saveAppVersion({
    id: appId,
    source: made.source,
    suggested: made.manifest,
    kind: 'regenerate',
    prompt,
    previous: loaded.manifest,
  })
  await finishApp(appId, manifest.name, manifest.description, prompt, 'regenerate', made.world, made.source)
  return { kind: 'app', appId, name: manifest.name, version: manifest.version }
}

async function runFix(ctx: JobContext, appId: string, error: string): Promise<GenResult> {
  const loaded = await requireGenerated(appId)
  ctx.setAppId(appId)
  const made = await generateSource(ctx, {
    appId,
    kind: 'app',
    mode: 'fix',
    intent: error,
    errorText: error,
    currentSource: loaded.source,
    appName: loaded.manifest.name,
  })
  const manifest = await persist.saveAppVersion({
    id: appId,
    source: made.source,
    suggested: made.manifest,
    kind: 'fix',
    prompt: error,
    previous: loaded.manifest,
  })
  await finishApp(appId, manifest.name, manifest.description, error, 'fix', made.world, made.source)
  return { kind: 'app', appId, name: manifest.name, version: manifest.version }
}

async function runView(ctx: JobContext, appId: string, intent: string, context?: unknown): Promise<GenResult> {
  const loaded = await getApp(appId)
  if (!loaded) throw new GeneratorError('App not found')
  // Screens are stored beside the app. A fixture's own source stays read-only.
  const existing = await viewsFor(appId)
  const viewIntent = [
    intent,
    existing.length ? `Existing screens: ${existing.map((view) => view.title || view.intent).join(', ')}` : '',
    context !== undefined ? `Context: ${JSON.stringify(context).slice(0, 2000)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const made = await generateSource(ctx, {
    appId,
    kind: 'view',
    mode: 'view',
    intent: viewIntent,
    currentSource: loaded.source,
    appName: loaded.manifest.name,
  })
  const viewId = viewIdFor(intent)
  await persist.saveView(appId, viewId, made.source, { intent, title: titleOf(intent) })
  await rememberView({ appId, viewId, intent, title: titleOf(intent) })
  await mergeWorld(appId, loaded.manifest.name, made.world, undefined, 'view')
  const keys = storageKeys(`${loaded.source}\n${made.source}`)
  if (keys.length) await mergeDelta(appId, loaded.manifest.name, { summary: { dataShapes: keys } }, 'view')
  await rememberLog({ at: new Date().toISOString(), intent, kind: 'view', appId, summary: viewId })
  return { kind: 'view', viewId, appId }
}

async function runContent(ctx: JobContext, body: GenBody): Promise<GenResult> {
  const key = cacheKeyOf(body)
  const data = await generateJson(ctx, {
    mode: 'content',
    kind: 'content',
    intent: body.intent,
    appId: body.appId,
    schema: body.schema,
    sessionKey: `content:${key}`,
    cwd: await scratchDir(key),
  })
  await rememberLog({
    at: new Date().toISOString(),
    intent: body.intent,
    kind: 'content',
    appId: body.appId,
    summary: summarize(data),
  })
  return { kind: 'content', data }
}

async function runAuto(ctx: JobContext, body: GenBody): Promise<GenResult> {
  const key = cacheKeyOf(body)
  const data = await generateJson(ctx, {
    mode: 'route',
    kind: 'route',
    intent: body.intent,
    appId: body.appId,
    schema: ROUTE_SCHEMA,
    sessionKey: `route:${key}`,
    cwd: await scratchDir(`route-${key}`),
  })
  const route = data as { route?: string; appId?: string }
  if (route.route === 'existing' && route.appId && (await getApp(route.appId))) {
    return { kind: 'app', appId: route.appId }
  }
  if (route.route === 'view') {
    const appId = route.appId || body.appId
    if (!appId || !(await getApp(appId))) throw new GeneratorError('No app to open that screen in')
    return runView(ctx, appId, body.intent, body.context)
  }
  return runCreate(ctx, body.intent)
}

async function requireGenerated(appId: string) {
  const loaded = await getApp(appId)
  if (!loaded) throw new GeneratorError('App not found')
  if (loaded.manifest.fixture) throw new GeneratorError('Fixtures cannot be edited')
  return loaded
}

type SourceRequest = {
  appId: string
  kind: 'app' | 'view'
  mode: PromptRequest['mode']
  intent: string
  errorText?: string
  currentSource?: string
  appName?: string
  freshSession?: boolean
}

async function generateSource(
  ctx: JobContext,
  request: SourceRequest,
): Promise<{ source: string; manifest: unknown; world: unknown; sessionId?: string }> {
  const cwd = await persist.ensureWorkspace(request.appId)
  if (request.currentSource && request.kind === 'app') {
    await persist.writeWorkspace(request.appId, { 'App.tsx': request.currentSource })
  }
  if (request.currentSource && request.kind === 'view') {
    await persist.writeWorkspace(request.appId, { 'App.tsx': request.currentSource })
    await fs.rm(path.join(cwd, 'View.tsx'), { force: true })
  }
  if (request.mode === 'create' || request.mode === 'regenerate') {
    await fs.rm(path.join(cwd, 'App.tsx'), { force: true })
    await fs.rm(path.join(cwd, 'app.tsx'), { force: true })
  }
  let sessionId: string | undefined
  let errors: CompileError[] = []
  const fileNames = request.kind === 'view' ? ['View.tsx', 'view.tsx'] : ['App.tsx', 'app.tsx']
  // A view reuses the app session when that session is still the one we would load, and then
  // does not resend the SDK. A missing session starts fresh with the digest in the prompt.
  const provider = await getProvider()
  const settings = settingsFor(provider.id, request.kind)
  const saved = request.kind === 'view' ? await loadSession(`app:${request.appId}`) : null
  const warmView = Boolean(
    saved &&
      saved.model === settings.model &&
      saved.effort === settings.effort &&
      path.resolve(saved.cwd) === path.resolve(cwd),
  )
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (ctx.signal.aborted) throw new GeneratorError('Cancelled')
    if (attempt > 1) {
      ctx.emit({ type: 'status', step: 'fixing', text: `Fixing compile error (attempt ${attempt}/3)` })
    }
    const failedSource = attempt > 1 ? await persist.readWorkspace(request.appId, fileNames) : null
    const errorText = [
      errors.length ? errors.map(formatError).join('\n') : request.errorText || '',
      request.kind === 'view' && failedSource ? `Previous View.tsx (inlined; write the corrected file once):\n${failedSource}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    const built = await buildPrompt({
      kind: request.kind,
      mode: request.mode,
      intent: request.intent,
      appId: request.appId,
      appName: request.appName,
      errorText: errorText || undefined,
      attempt,
      currentSource: request.kind === 'view' ? request.currentSource : failedSource || request.currentSource,
      omitSdk: warmView && attempt === 1,
    })
    const turn = await drive(ctx, {
      prompt: built.prompt,
      cwd,
      kind: request.kind,
      resumeSessionId: sessionId,
      freshSession: attempt === 1 ? Boolean(request.freshSession) || (request.kind === 'view' && !warmView) : false,
      sessionKey: request.kind === 'view' && !warmView ? undefined : `app:${request.appId}`,
    })
    sessionId = turn.sessionId || sessionId
    ctx.emit({ type: 'status', step: 'compiling', text: 'Compiling' })
    const source = await persist.readWorkspace(request.appId, fileNames)
    if (!source) {
      errors = [{ message: `No ${fileNames[0]} was written in the workspace.` }]
      continue
    }
    const compiled = await compileApp(source)
    const shape = shapeErrors(source, request.kind)
    if (compiled.ok && shape.length === 0) {
      return {
        source,
        manifest: await persist.readJsonWorkspace(request.appId, 'manifest.json'),
        world: await persist.readJsonWorkspace(request.appId, 'world.json'),
        sessionId,
      }
    }
    errors = [...(compiled.ok ? [] : compiled.errors), ...shape]
  }
  throw new GeneratorError(errors.map(formatError).join('\n') || 'Compile failed')
}

async function generateJson(
  ctx: JobContext,
  input: {
    mode: 'content' | 'route'
    kind: GenKind
    intent: string
    appId?: string
    schema?: Record<string, unknown>
    sessionKey: string
    cwd: string
  },
): Promise<unknown> {
  const provider = await getProvider()
  const schema =
    input.schema && (provider.id === 'codex' || provider.id === 'claude') ? strictOutputSchema(input.schema) : input.schema
  let sessionId: string | undefined
  let problems: string[] = []
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (ctx.signal.aborted) throw new GeneratorError('Cancelled')
    if (attempt > 1) ctx.emit({ type: 'status', step: 'fixing', text: 'Fixing the response' })
    const built = await buildPrompt({
      kind: input.kind,
      mode: input.mode,
      intent: problems.length ? `${input.intent}\n\nThe previous JSON was invalid:\n${problems.join('\n')}` : input.intent,
      appId: input.appId,
      schema,
      attempt,
    })
    const turn = await drive(ctx, {
      prompt: built.prompt,
      cwd: input.cwd,
      kind: input.kind,
      schema,
      resumeSessionId: attempt === 1 ? undefined : sessionId,
      freshSession: attempt === 1,
      sessionKey: input.sessionKey,
    })
    sessionId = turn.sessionId || sessionId
    try {
      const data = parseJsonText(turn.output)
      problems = validateJson(schema, data)
      if (!problems.length) return data
    } catch (err) {
      problems = [err instanceof Error ? err.message : 'invalid JSON']
    }
  }
  throw new GeneratorError(problems.join('; ') || 'Response did not match the schema')
}

async function drive(
  ctx: JobContext,
  input: {
    prompt: string
    cwd: string
    kind: GenKind
    schema?: Record<string, unknown>
    resumeSessionId?: string
    freshSession?: boolean
    sessionKey?: string
  },
): Promise<{ sessionId?: string; output: string }> {
  const provider = await getProvider()
  const settings = settingsFor(provider.id, input.kind)
  let output = ''
  let sessionId = input.resumeSessionId
  let sawThinking = false
  for await (const event of runProvider(provider, {
    prompt: input.prompt,
    cwd: input.cwd,
    kind: input.kind,
    jsonSchema: input.schema,
    resumeSessionId: input.resumeSessionId,
    freshSession: input.freshSession,
    sessionKey: input.sessionKey,
    signal: ctx.signal,
    timeoutMs: timeoutFor(input.kind),
    model: settings.model,
    effort: settings.effort,
  })) {
    if (ctx.signal.aborted) throw new GeneratorError('Cancelled')
    if (event.type === 'error') throw new GeneratorError(event.message, Boolean(event.auth))
    if (event.type === 'end') {
      sessionId = event.sessionId || sessionId
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
  return { sessionId, output }
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

async function finishApp(appId: string, name: string, description: string | undefined, intent: string, kind: string, world: unknown, source: string): Promise<void> {
  await mergeWorld(appId, name, world, description, 'app')
  const keys = storageKeys(source)
  if (keys.length) await mergeDelta(appId, name, { summary: { dataShapes: keys } }, 'app')
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

function storageKeys(source: string): string[] {
  const keys = new Set<string>()
  for (const match of source.matchAll(/useStorage(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/g)) keys.add(match[1])
  for (const match of source.matchAll(/storage\.(?:get|set|remove)(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/g)) keys.add(match[1])
  return [...keys]
}

function normalizeDelta(value: unknown): WorldDelta | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as WorldDelta
  return raw
}

function shapeErrors(source: string, kind: 'app' | 'view'): CompileError[] {
  if (kind === 'view') {
    if (!/export\s+default\s+function\s+View\b/.test(source)) {
      return [{ message: 'View must be `export default function View({ params, context })`.' }]
    }
    return []
  }
  if (!/export\s+default\s+function\s+App\b/.test(source)) {
    return [{ message: 'App must be `export default function App()`.' }]
  }
  return []
}

function formatError(error: CompileError): string {
  return error.line ? `Line ${error.line}: ${error.message}` : error.message
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

async function scratchDir(key: string): Promise<string> {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'scratch'
  const dir = path.join(workspacesDir, '_scratch', safe)
  await fs.mkdir(dir, { recursive: true })
  return dir
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

function summarize(data: unknown): string {
  const text = JSON.stringify(data)
  return text.length <= 180 ? text : `${text.slice(0, 179)}…`
}

export async function describeWorld(): Promise<Awaited<ReturnType<typeof worldDigest>>> {
  return worldDigest()
}
