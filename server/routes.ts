import { createHash } from 'node:crypto'
import { encodingFor, sendEncoded } from './compress'
import { sendJson, readBody } from './http'
import type { Router } from './router'
import { deleteApp, getApp, listApps } from './apps/registry'
import { SCREEN_CSP, screenDocument } from './apps/screen'
import { readScreen } from './generator/persist'
import { getGrokStatus } from './generator'
import { getSettings, putSettings } from './settings'

const APP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

export function registerRoutes(router: Router): void {
  router.get('/api/health', async (ctx) => {
    sendJson(ctx.res, 200, { ok: true, grok: await getGrokStatus() })
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

  /** A screen as its own document: `root` is the first screen, anything else a later one. */
  router.get('/api/apps/:id/screens/:viewId', async (ctx) => {
    const id = ctx.params.id
    const viewId = ctx.params.viewId
    if (!id || !APP_ID.test(id) || !viewId || !APP_ID.test(viewId)) return sendJson(ctx.res, 400, { error: 'invalid id' })
    const html = await readScreen(id, viewId)
    if (html === null) return sendJson(ctx.res, 404, { error: 'not found' })
    const body = Buffer.from(screenDocument(html))
    const hash = createHash('sha1').update(body).digest('hex').slice(0, 16)
    const encoding = encodingFor(ctx.req, body.length, '.html')
    const etag = `"${encoding ? `${hash}-${encoding}` : hash}"`
    const headers = { 'Content-Security-Policy': SCREEN_CSP, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' }
    if (ctx.req.headers['if-none-match'] === etag) {
      ctx.res.writeHead(304, { ...headers, ETag: etag })
      ctx.res.end()
      return
    }
    sendEncoded(ctx.req, ctx.res, body, { ...headers, 'Content-Type': 'text/html; charset=utf-8', ETag: etag }, hash, encoding)
  })

  router.delete('/api/apps/:id', async (ctx) => {
    const id = ctx.params.id
    if (!id || !APP_ID.test(id)) return sendJson(ctx.res, 400, { error: 'invalid id' })
    const result = await deleteApp(id)
    if (result === 'not-found') return sendJson(ctx.res, 404, { error: 'not found' })
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
}
