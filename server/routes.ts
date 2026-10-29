import { createHash } from 'node:crypto'
import { sendJson, sendText, readBody, type Ctx } from './http'
import type { Router } from './router'
import { bundleFor } from './apps/bundles'
import { deleteApp, getApp, listApps } from './apps/registry'
import { storageGet, storageGetAll, storageRemove, storageSet } from './apps/storage'
import { getGrokStatus } from './grok'
import { proxyRequest } from './proxy'
import { getSettings, putSettings } from './settings'

const APP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

export function registerRoutes(router: Router): void {
  router.get('/api/health', (ctx) => {
    sendJson(ctx.res, 200, { ok: true, grok: getGrokStatus() })
  })

  router.get('/api/apps', async (ctx) => {
    sendJson(ctx.res, 200, await listApps())
  })

  router.get('/api/apps/:id', async (ctx) => {
    const id = ctx.params.id
    if (!id || !APP_ID.test(id)) return sendJson(ctx.res, 400, { error: 'invalid id' })
    const app = await getApp(id)
    if (!app) return sendJson(ctx.res, 404, { error: 'not found' })
    sendJson(ctx.res, 200, app)
  })

  router.get('/api/apps/:id/bundle.js', async (ctx) => {
    const id = ctx.params.id
    if (!id || !APP_ID.test(id)) return sendJson(ctx.res, 400, { error: 'invalid id' })
    const code = await bundleFor(id)
    if (!code) return sendJson(ctx.res, 404, { error: 'not found' })
    const etag = `"${createHash('sha1').update(code).digest('hex').slice(0, 16)}"`
    if (ctx.req.headers['if-none-match'] === etag) {
      ctx.res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' })
      ctx.res.end()
      return
    }
    sendText(ctx.res, 200, code, 'text/javascript; charset=utf-8', {
      ETag: etag,
      'Cache-Control': 'no-cache',
    })
  })

  router.delete('/api/apps/:id', async (ctx) => {
    const id = ctx.params.id
    if (!id || !APP_ID.test(id)) return sendJson(ctx.res, 400, { error: 'invalid id' })
    const result = await deleteApp(id)
    if (result === 'not-found') return sendJson(ctx.res, 404, { error: 'not found' })
    if (result === 'fixture') return sendJson(ctx.res, 403, { error: 'fixtures cannot be deleted' })
    sendJson(ctx.res, 200, { ok: true })
  })

  router.get('/api/storage/:appId', async (ctx) => {
    if (!validId(ctx)) return
    sendJson(ctx.res, 200, { data: await storageGetAll(ctx.params.appId!) })
  })

  router.get('/api/storage/:appId/:key', async (ctx) => {
    if (!validId(ctx)) return
    const key = ctx.params.key
    if (!key) return sendJson(ctx.res, 400, { error: 'missing key' })
    const value = await storageGet(ctx.params.appId!, key)
    if (value === undefined) return sendJson(ctx.res, 404, { error: 'not found' })
    sendJson(ctx.res, 200, { value })
  })

  router.put('/api/storage/:appId/:key', async (ctx) => {
    if (!validId(ctx)) return
    const key = ctx.params.key
    if (!key) return sendJson(ctx.res, 400, { error: 'missing key' })
    const body = await readBody(ctx)
    if (body === undefined) return
    if (!isObject(body) || !('value' in body)) return sendJson(ctx.res, 400, { error: 'expected { value }' })
    await storageSet(ctx.params.appId!, key, body.value)
    sendJson(ctx.res, 200, { ok: true })
  })

  router.delete('/api/storage/:appId/:key', async (ctx) => {
    if (!validId(ctx)) return
    const key = ctx.params.key
    if (!key) return sendJson(ctx.res, 400, { error: 'missing key' })
    await storageRemove(ctx.params.appId!, key)
    sendJson(ctx.res, 200, { ok: true })
  })

  router.get('/api/settings', async (ctx) => {
    sendJson(ctx.res, 200, await getSettings())
  })

  router.put('/api/settings', async (ctx) => {
    const body = await readBody(ctx)
    if (body === undefined) return
    sendJson(ctx.res, 200, await putSettings(body))
  })

  router.post('/api/proxy', async (ctx) => {
    const body = await readBody(ctx)
    if (body === undefined) return
    if (!isObject(body)) return sendJson(ctx.res, 400, { error: 'expected an object' })
    const result = await proxyRequest(body)
    if (!result.ok) return sendJson(ctx.res, 400, { error: result.error })
    sendJson(ctx.res, 200, { status: result.status, headers: result.headers, body: result.body })
  })
}

function validId(ctx: Ctx): boolean {
  const id = ctx.params.appId
  if (!id || !APP_ID.test(id)) {
    sendJson(ctx.res, 400, { error: 'invalid id' })
    return false
  }
  return true
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
