import type { PersistedScreen, SlopMessage } from '../../../../runtime/protocol'
import { useShell, type Win } from '../store'

type GenResult =
  | { kind: 'content'; data: unknown }
  | { kind: 'view'; viewId: string }
  | { kind: 'app'; appId: string }

type Post = (message: { type: string; payload?: unknown }) => void

/**
 * Host side of gen.request / gen.open / screens.state.
 * Forwards generation to POST /api/gen and relays job events.
 * Pass C owns the server endpoint; this module only speaks the spec.
 */
export async function routeGenMessage(win: Win, message: SlopMessage, post: Post): Promise<boolean> {
  if (message.type === 'screens.state') {
    const stack = normalizeScreens((message.payload as { stack?: unknown } | undefined)?.stack)
    useShell.getState().setWindowScreens(win.id, stack)
    return true
  }
  if (message.type !== 'gen.request' && message.type !== 'gen.open') return false

  const payload = (message.payload ?? {}) as Record<string, unknown>
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
  const req = message.type === 'gen.open' ? openReq(payload) : asRecord(payload.req)

  try {
    const intent = typeof req.intent === 'string' ? req.intent.trim() : ''
    if (!intent) throw new Error('Missing intent')
    const result = await runGen(win, { ...req, intent }, (status, text) => {
      post({ type: 'gen.progress', payload: { requestId, status, text } })
    })
    if (message.type === 'gen.open' && result.kind === 'app') {
      await useShell.getState().refreshApps()
      useShell.getState().openApp(result.appId)
    }
    post({ type: 'gen.result', payload: { requestId, result } })
  } catch (err) {
    if (err instanceof Error) console.warn(err.message)
    post({ type: 'gen.error', payload: { requestId, error: 'Couldn’t load' } })
  }
  return true
}

function openReq(payload: Record<string, unknown>): Record<string, unknown> {
  return { kind: 'auto', intent: payload.intent, context: payload.context, fresh: payload.fresh, key: payload.key, schema: payload.schema }
}

async function runGen(win: Win, req: Record<string, unknown>, onProgress: (status: string, text: string) => void): Promise<GenResult> {
  const res = await fetch('/api/gen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appId: win.appId,
      windowId: win.id,
      kind: typeof req.kind === 'string' ? req.kind : 'auto',
      intent: req.intent,
      context: withApp(win, req.context),
      schema: req.schema,
      key: typeof req.key === 'string' ? req.key : undefined,
      fresh: req.fresh === true,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string; cached?: boolean; result?: unknown; jobId?: string }
  if (!res.ok) {
    if (res.status === 404 || res.status === 501) throw new Error("Generation isn't available yet")
    throw new Error(body.error || 'Generation failed')
  }
  if (body.cached) {
    if (!isResult(body.result)) throw new Error('Generation returned nothing')
    return body.result
  }
  if (!body.jobId) throw new Error('Generation returned nothing')
  return readJob(body.jobId, onProgress)
}

async function readJob(jobId: string, onProgress: (status: string, text: string) => void): Promise<GenResult> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/events`)
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (res.status === 404 || res.status === 501) throw new Error("Generation isn't available yet")
    throw new Error(body.error || 'Generation failed')
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const data = part
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')
      if (!data) continue
      const event = JSON.parse(data) as { type?: string; text?: string; message?: string; error?: string; result?: unknown }
      if (event.type === 'done') {
        if (!isResult(event.result)) throw new Error('Generation returned nothing')
        return event.result
      }
      if (event.type === 'error') throw new Error(event.error || event.message || 'Generation failed')
      const text = event.text || event.message || ''
      if (text) onProgress(event.type || 'status', text)
    }
  }
  throw new Error('Generation ended without a result')
}

function withApp(win: Win, context: unknown): unknown {
  const app = useShell.getState().apps.find((item) => item.id === win.appId)
  const base = { app: { id: win.appId, name: app?.name ?? win.appId } }
  if (!context || typeof context !== 'object' || Array.isArray(context)) return { ...base, detail: context }
  const record = context as Record<string, unknown>
  const named = record.app && typeof record.app === 'object' ? (record.app as Record<string, unknown>) : {}
  return { ...base, ...record, app: { ...base.app, ...named } }
}

function isResult(value: unknown): value is GenResult {
  if (!value || typeof value !== 'object') return false
  const record = value as { kind?: string; viewId?: unknown; appId?: unknown }
  if (record.kind === 'content') return 'data' in (value as object)
  if (record.kind === 'view') return typeof record.viewId === 'string'
  if (record.kind === 'app') return typeof record.appId === 'string'
  return false
}

export function normalizeScreens(raw: unknown): PersistedScreen[] {
  if (!Array.isArray(raw)) return []
  const screens: PersistedScreen[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const screen = item as Record<string, unknown>
    if (typeof screen.id !== 'string' || typeof screen.viewId !== 'string' || !screen.viewId) continue
    screens.push({
      id: screen.id,
      title: typeof screen.title === 'string' && screen.title ? screen.title : 'Page',
      viewId: screen.viewId,
      intent: typeof screen.intent === 'string' ? screen.intent : undefined,
      params: screen.params,
      context: screen.context,
    })
    if (screens.length >= 24) break
  }
  return screens
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}
