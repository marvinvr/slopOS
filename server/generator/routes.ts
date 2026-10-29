import { createHash } from 'node:crypto'
import { getApp } from '../apps/registry'
import { readBody, sendJson, sendText, type Ctx } from '../http'
import type { Router } from '../router'
import { providerId } from './config'
import { getProvider } from './providers/load'
import { revert, resetEverything, startCreate, startEdit, startFix, startGen, startRegenerate } from './pipeline'
import { cancelJob, eventsOf, getJob, listJobs, subscribe } from './queue'
import type { SseEvent } from './types'
import { worldSnapshot } from './world'
import { viewBundle } from './views'

const APP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

export async function getGrokStatus(): Promise<{
  available: boolean
  loggedIn?: boolean
  model: string
  effort: string
  reason?: string
  provider: string
}> {
  const provider = await getProvider()
  const status = await provider.availability()
  return { ...status, provider: provider.id || providerId() }
}

export function registerGeneratorRoutes(router: Router): void {
  router.post('/api/apps/generate', async (ctx) => {
    const body = await objectBody(ctx)
    if (!body) return
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) return sendJson(ctx.res, 400, { error: 'expected { prompt }' })
    sendJson(ctx.res, 200, { jobId: await startCreate(prompt) })
  })

  router.post('/api/apps/:id/edit', async (ctx) => {
    const id = ctx.params.id
    if (!valid(id)) return sendJson(ctx.res, 400, { error: 'invalid id' })
    const denied = await fixtureBlock(id)
    if (denied) return sendJson(ctx.res, denied, { error: denied === 404 ? 'not found' : 'fixtures cannot be edited' })
    const body = await objectBody(ctx)
    if (!body) return
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) return sendJson(ctx.res, 400, { error: 'expected { prompt }' })
    sendJson(ctx.res, 200, { jobId: await startEdit(id, prompt) })
  })

  router.post('/api/apps/:id/regenerate', async (ctx) => {
    const id = ctx.params.id
    if (!valid(id)) return sendJson(ctx.res, 400, { error: 'invalid id' })
    const denied = await fixtureBlock(id)
    if (denied) return sendJson(ctx.res, denied, { error: denied === 404 ? 'not found' : 'fixtures cannot be edited' })
    sendJson(ctx.res, 200, { jobId: await startRegenerate(id) })
  })

  router.post('/api/apps/:id/fix', async (ctx) => {
    const id = ctx.params.id
    if (!valid(id)) return sendJson(ctx.res, 400, { error: 'invalid id' })
    const denied = await fixtureBlock(id)
    if (denied) return sendJson(ctx.res, denied, { error: denied === 404 ? 'not found' : 'fixtures cannot be edited' })
    const body = await objectBody(ctx)
    if (!body) return
    const error = typeof body.error === 'string' ? body.error.trim() : ''
    if (!error) return sendJson(ctx.res, 400, { error: 'expected { error }' })
    sendJson(ctx.res, 200, { jobId: await startFix(id, error) })
  })

  router.post('/api/apps/:id/revert', async (ctx) => {
    const id = ctx.params.id
    if (!valid(id)) return sendJson(ctx.res, 400, { error: 'invalid id' })
    const denied = await fixtureBlock(id)
    if (denied) return sendJson(ctx.res, denied, { error: denied === 404 ? 'not found' : 'fixtures cannot be edited' })
    const body = await objectBody(ctx)
    if (!body) return
    const version = typeof body.version === 'number' ? body.version : Number.NaN
    if (!Number.isInteger(version)) return sendJson(ctx.res, 400, { error: 'expected { version }' })
    const result = await revert(id, version)
    if ('error' in result) return sendJson(ctx.res, result.status, { error: result.error })
    sendJson(ctx.res, 200, result.manifest)
  })

  router.get('/api/jobs', (ctx) => {
    sendJson(ctx.res, 200, listJobs())
  })

  router.post('/api/jobs/:id/cancel', (ctx) => {
    const id = ctx.params.id
    if (!id || !cancelJob(id)) return sendJson(ctx.res, 404, { error: 'not found' })
    sendJson(ctx.res, 200, { ok: true })
  })

  router.get('/api/jobs/:id/events', (ctx) => {
    const id = ctx.params.id
    if (!id || !getJob(id)) return sendJson(ctx.res, 404, { error: 'not found' })
    streamJob(ctx, id)
  })

  router.post('/api/gen', async (ctx) => {
    const body = await objectBody(ctx)
    if (!body) return
    const intent = typeof body.intent === 'string' ? body.intent.trim() : ''
    const kind = body.kind
    if (!intent) return sendJson(ctx.res, 400, { error: 'expected { intent }' })
    if (kind !== 'auto' && kind !== 'app' && kind !== 'view' && kind !== 'content') {
      return sendJson(ctx.res, 400, { error: 'kind must be auto, app, view, or content' })
    }
    const schema = body.schema && typeof body.schema === 'object' ? (body.schema as Record<string, unknown>) : undefined
    const result = await startGen({
      appId: typeof body.appId === 'string' ? body.appId : undefined,
      windowId: typeof body.windowId === 'string' ? body.windowId : undefined,
      kind,
      intent,
      context: body.context,
      schema,
      key: typeof body.key === 'string' ? body.key : undefined,
      fresh: body.fresh === true,
    })
    sendJson(ctx.res, 200, result)
  })

  router.get('/api/world', async (ctx) => {
    sendJson(ctx.res, 200, await worldSnapshot())
  })

  router.post('/api/reset', async (ctx) => {
    const body = await objectBody(ctx)
    if (!body) return
    if (body.confirm !== 'RESET') return sendJson(ctx.res, 400, { error: 'expected { confirm: "RESET" }' })
    await resetEverything()
    sendJson(ctx.res, 200, { ok: true })
  })

  router.get('/api/apps/:id/views/:viewId/bundle.js', async (ctx) => {
    const id = ctx.params.id
    const viewId = ctx.params.viewId
    if (!valid(id) || !valid(viewId)) return sendJson(ctx.res, 400, { error: 'invalid id' })
    const code = await viewBundle(id, viewId)
    if (!code) return sendJson(ctx.res, 404, { error: 'not found' })
    const etag = `"${createHash('sha1').update(code).digest('hex').slice(0, 16)}"`
    if (ctx.req.headers['if-none-match'] === etag) {
      ctx.res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' })
      ctx.res.end()
      return
    }
    sendText(ctx.res, 200, code, 'text/javascript; charset=utf-8', { ETag: etag, 'Cache-Control': 'no-cache' })
  })
}

function streamJob(ctx: Ctx, id: string): void {
  const res = ctx.res
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })
  let last = 0
  let closed = false
  let beat: ReturnType<typeof setInterval> | null = null
  let stop: (() => void) | null = null
  const finish = () => {
    if (closed) return
    closed = true
    if (beat) clearInterval(beat)
    stop?.()
    res.end()
  }
  const send = (event: SseEvent) => {
    if (closed) return
    const seq = event.seq || 0
    if (seq && seq <= last) return
    if (seq) last = seq
    res.write(`data: ${JSON.stringify(event)}\n\n`)
    if (event.type === 'done' || event.type === 'error') finish()
  }
  stop = subscribe(id, send)
  for (const event of eventsOf(id) || []) send(event)
  if (closed) return
  beat = setInterval(() => {
    if (!closed) res.write(': ping\n\n')
  }, 15000)
  ctx.req.on('close', finish)
}

function valid(id: string | undefined): id is string {
  return Boolean(id && APP_ID.test(id))
}

async function fixtureBlock(id: string): Promise<number | null> {
  const app = await getApp(id)
  if (!app) return 404
  if (app.manifest.fixture) return 403
  return null
}

async function objectBody(ctx: Ctx): Promise<Record<string, unknown> | undefined> {
  const body = await readBody(ctx)
  if (body === undefined) return undefined
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    sendJson(ctx.res, 400, { error: 'expected a JSON object' })
    return undefined
  }
  return body as Record<string, unknown>
}
