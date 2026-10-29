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
 * Generation stub.
 * TODO(pass C): replace this module with a pluggable server/generator/
 * (SLOPOS_GENERATOR, SLOPOS_GROK_BIN / SLOPOS_GROK_MODEL / SLOPOS_GROK_EFFORT).
 * Never call the xAI HTTP API and never set an API key.
 */
export function getGrokStatus(): GrokStatus {
  return {
    available: false,
    reason: 'not implemented yet',
    model: process.env.SLOPOS_GROK_MODEL || 'grok-4.7',
    effort: process.env.SLOPOS_GROK_EFFORT || 'medium',
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
