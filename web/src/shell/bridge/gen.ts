import type { GenResult } from '../generation/api'
import { useShell, type Win } from '../store'

type ViewResult = Extract<GenResult, { kind: 'view' }>

/** The screen that follows an interaction: POST /api/gen, then the job's SSE until it is done. */
export async function requestScreen(win: Win, req: { intent: string; context: unknown; key: string; fresh?: boolean }): Promise<ViewResult> {
  const res = await fetch('/api/gen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appId: win.appId,
      windowId: win.id,
      kind: 'view',
      intent: req.intent,
      context: withApp(win, req.context),
      key: req.key,
      fresh: req.fresh === true,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string; cached?: boolean; result?: unknown; jobId?: string }
  if (!res.ok) throw new Error(body.error || 'Generation failed')
  if (body.cached) return asView(body.result)
  if (!body.jobId) throw new Error('Generation returned nothing')
  return asView(await readJob(body.jobId))
}

async function readJob(jobId: string): Promise<unknown> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/events`)
  if (!res.ok || !res.body) throw new Error('Generation failed')
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
      const event = JSON.parse(data) as { type?: string; message?: string; error?: string; result?: unknown }
      if (event.type === 'done') return event.result
      if (event.type === 'error') throw new Error(event.error || event.message || 'Generation failed')
    }
  }
  throw new Error('Generation ended without a result')
}

function withApp(win: Win, context: unknown): unknown {
  const app = useShell.getState().apps.find((item) => item.id === win.appId)
  const record = context && typeof context === 'object' && !Array.isArray(context) ? (context as Record<string, unknown>) : {}
  return { ...record, app: { id: win.appId, name: app?.name ?? win.appId } }
}

function asView(value: unknown): ViewResult {
  const record = (value ?? {}) as { kind?: string; viewId?: unknown }
  if (record.kind !== 'view' || typeof record.viewId !== 'string') throw new Error('Generation returned nothing')
  return value as ViewResult
}
