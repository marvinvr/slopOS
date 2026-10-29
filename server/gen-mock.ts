import { createHash, randomBytes } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { listApps } from './apps/registry'
import { readBody, sendJson, sendText } from './http'
import type { Router } from './router'

/**
 * Canned POST /api/gen for this branch until pass C serves the real endpoint.
 * Enabled with SLOPOS_GROK_MOCK=1 (SLOP_GROK_MOCK=1 is accepted too).
 * Registered before the grok stub so its job-event route wins while the flag is on.
 */

type GenResult =
  | { kind: 'content'; data: unknown }
  | { kind: 'view'; viewId: string }
  | { kind: 'app'; appId: string }

type Job = { events: { type: string; text?: string; error?: string; result?: GenResult }[] }

const jobs = new Map<string, Job>()
const views = new Map<string, { title: string; body: string }>()
const cache = new Map<string, GenResult>()

export function grokMockEnabled(): boolean {
  return process.env.SLOPOS_GROK_MOCK === '1' || process.env.SLOP_GROK_MOCK === '1'
}

export function registerGenMock(router: Router): void {
  router.post('/api/gen', async (ctx) => {
    const body = await readBody(ctx)
    if (body === undefined) return
    if (!isObject(body) || typeof body.intent !== 'string' || !body.intent.trim()) {
      sendJson(ctx.res, 400, { error: 'expected { intent }' })
      return
    }
    const intent = body.intent.trim()
    const kind = await decideKind(body, intent)
    const fresh = body.fresh === true
    const cacheKey = [typeof body.appId === 'string' ? body.appId : '', kind, intent.toLowerCase(), typeof body.key === 'string' ? body.key : ''].join('|')
    if (!fresh && cache.has(cacheKey)) {
      sendJson(ctx.res, 200, { cached: true, result: cache.get(cacheKey) })
      return
    }
    const result = await makeResult(kind, intent, body)
    cache.set(cacheKey, result)
    if (kind === 'content' || kind === 'app') {
      sendJson(ctx.res, 200, { cached: true, result })
      return
    }
    const jobId = randomBytes(8).toString('hex')
    jobs.set(jobId, {
      events: [
        { type: 'status', text: 'Sketching layout…' },
        { type: 'status', text: 'Setting the type…' },
        { type: 'done', result },
      ],
    })
    sendJson(ctx.res, 200, { jobId })
  })

  router.get('/api/jobs/:id/events', (ctx) => {
    const job = jobs.get(ctx.params.id ?? '')
    if (!job) {
      sendJson(ctx.res, 404, { error: 'unknown job' })
      return
    }
    writeEvents(ctx.res, job.events)
  })

  router.get('/api/apps/:id/views/:viewId/bundle.js', (ctx) => {
    const viewId = ctx.params.viewId ?? ''
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(viewId)) {
      sendJson(ctx.res, 400, { error: 'invalid view' })
      return
    }
    const page = views.get(viewId) ?? { title: 'Page', body: 'This page is still a sketch.' }
    sendText(ctx.res, 200, viewModule(page.title, page.body), 'text/javascript; charset=utf-8', {
      'Cache-Control': 'no-cache',
    })
  })
}

async function decideKind(body: Record<string, unknown>, intent: string): Promise<'content' | 'view' | 'app'> {
  if (body.kind === 'content') return 'content'
  if (body.kind === 'view') return 'view'
  if (body.kind === 'app') return 'app'
  if (isObject(body.schema)) return 'content'
  const apps = await listApps().catch(() => [])
  const needle = intent.toLowerCase()
  const hit = apps.find((app) => app.name.toLowerCase() === needle || app.id === needle)
  if (hit) return 'app'
  return body.appId ? 'view' : 'app'
}

async function makeResult(kind: 'content' | 'view' | 'app', intent: string, body: Record<string, unknown>): Promise<GenResult> {
  if (kind === 'content') return { kind: 'content', data: mockContent(intent, body.schema) }
  if (kind === 'app') {
    const apps = await listApps().catch(() => [])
    const needle = intent.toLowerCase()
    const hit = apps.find((app) => app.name.toLowerCase() === needle || app.id === needle)
    return { kind: 'app', appId: hit?.id ?? apps[0]?.id ?? 'notes' }
  }
  const viewId = body.fresh === true ? `v${randomBytes(6).toString('hex')}` : `v${createHash('sha1').update(intent).digest('hex').slice(0, 12)}`
  views.set(viewId, { title: titleFrom(intent), body: paragraph(intent) })
  return { kind: 'view', viewId }
}

function mockContent(intent: string, schema: unknown): unknown {
  const title = titleFrom(intent)
  const summary = paragraph(intent)
  if (!isObject(schema) || !isObject(schema.properties)) return { title, summary }
  const data: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(schema.properties)) {
    const type = isObject(spec) && typeof spec.type === 'string' ? spec.type : 'string'
    if (key === 'title' || key === 'name') data[key] = title
    else if (key === 'summary' || key === 'body' || key === 'text' || key === 'lede') data[key] = summary
    else if (type === 'number' || type === 'integer') data[key] = 3
    else if (type === 'boolean') data[key] = true
    else if (type === 'array') data[key] = [{ title: 'Overview', note: summary }]
    else data[key] = summary
  }
  return Object.keys(data).length ? data : { title, summary }
}

function titleFrom(intent: string): string {
  const stripped = intent
    .replace(/^a (short |two-sentence )?/i, '')
    .replace(/^(encyclopedia entry|welcome|search) (for|to|results for) /i, '')
    .replace(/^more about /i, '')
    .trim()
  if (!stripped) return 'Page'
  return stripped.charAt(0).toUpperCase() + stripped.slice(1)
}

function paragraph(intent: string): string {
  const title = titleFrom(intent)
  return `${title} sits in this world as a small, finished thing — warm, specific, and easy to come back to. The next visit should feel like the same page, not a new invention.`
}

function viewModule(title: string, body: string): string {
  const baked = JSON.stringify({ title, body })
  return `import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, Card, Heading, Stack, Text } from "@slop/sdk";
const baked = ${baked};
export default function View({ params }) {
  const title = (params && params.title) || baked.title;
  const body = (params && params.body) || baked.body;
  return _jsxs(Stack, {
    gap: 14,
    style: { padding: 22, maxWidth: 560 },
    children: [
      _jsx(Heading, { children: title }),
      _jsx(Text, { muted: true, children: body }),
      _jsx(Card, { children: _jsx(Text, { children: "Saved with this window, so a reload opens the same page." }) }),
      _jsx(Button, { intent: "More about " + title, children: "More about this" }),
    ],
  });
}
`
}

function writeEvents(res: ServerResponse, events: Job['events']): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  let index = 0
  const timer = setInterval(() => {
    const event = events[index]
    index += 1
    if (!event) {
      clearInterval(timer)
      res.end()
      return
    }
    res.write(`data: ${JSON.stringify(event)}\n\n`)
    if (event.type === 'done' || event.type === 'error') {
      clearInterval(timer)
      res.end()
    }
  }, 160)
  res.on('close', () => clearInterval(timer))
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
