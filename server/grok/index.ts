import type { Ctx } from '../http'
import { sendJson } from '../http'
import type { Router } from '../router'

export type GrokStatus = {
  available: boolean
  loggedIn?: boolean
  model: string
  effort: string
  reason?: string
}

/**
 * Grok generation pipeline.
 * TODO(pass C): replace this stub with the grok CLI runner.
 * Own: availability probe (`grok` on PATH / SLOP_GROK_BIN), one-at-a-time job queue,
 * streaming SSE at GET /api/jobs/:id/events, generate / edit / regenerate / fix / revert,
 * workspace files under data/workspaces/<appId>/, and validation retries through
 * compileApp() in server/apps/compile.ts (up to 3 attempts).
 * Spawn `grok` headless. Strip XAI_API_KEY, GROK_API_KEY, and any xAI *_API_KEY from the
 * child env. Never call the xAI HTTP API and never set an API key.
 */
export function getGrokStatus(): GrokStatus {
  return {
    available: false,
    reason: 'not implemented yet',
    model: process.env.SLOP_GROK_MODEL || 'grok-4.7',
    effort: process.env.SLOP_GROK_EFFORT || 'medium',
  }
}

export function registerGrokRoutes(router: Router): void {
  const notReady = (ctx: Ctx) => {
    sendJson(ctx.res, 501, { error: 'not implemented yet' })
  }
  router.post('/api/apps/generate', notReady)
  router.post('/api/apps/:id/edit', notReady)
  router.post('/api/apps/:id/regenerate', notReady)
  router.post('/api/apps/:id/fix', notReady)
  router.post('/api/apps/:id/revert', notReady)
  router.get('/api/jobs', notReady)
  router.get('/api/jobs/:id/events', notReady)
}
