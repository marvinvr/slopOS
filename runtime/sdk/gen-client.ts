import { frameAppId, onHostMessage, send } from './host'

export type GenKind = 'auto' | 'app' | 'view' | 'content'

export type GenRequest = {
  intent: string
  kind?: GenKind
  context?: unknown
  schema?: object
  key?: string
  fresh?: boolean
}

export type GenResult<T = unknown> =
  | { kind: 'content'; data: T }
  | { kind: 'view'; viewId: string }
  | { kind: 'app'; appId: string }

type Waiter = {
  onProgress?: (text: string) => void
  resolve: (result: GenResult) => void
  reject: (error: Error) => void
  timer: number
}

const waiters = new Map<string, Waiter>()
const contextStack: Record<string, unknown>[] = []
let listening = false
let seq = 0
let screenLabel = ''
let appLabel = ''

export function bindGenContext(ctx: Record<string, unknown>): () => void {
  contextStack.push(ctx)
  return () => {
    const index = contextStack.lastIndexOf(ctx)
    if (index >= 0) contextStack.splice(index, 1)
  }
}

export function setGenScreenLabel(label: string): void {
  screenLabel = label
}

export function setGenAppLabel(label: string): void {
  appLabel = label
}

function mergedContext(extra: unknown): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    app: { id: frameAppId, name: appLabel || frameAppId },
  }
  if (screenLabel) merged.screen = screenLabel
  for (const layer of contextStack) Object.assign(merged, layer)
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) Object.assign(merged, extra as Record<string, unknown>)
  else if (extra !== undefined) merged.detail = extra
  return merged
}

function ensureListener(): void {
  if (listening) return
  listening = true
  onHostMessage((msg) => {
    const payload = (msg.payload ?? {}) as { requestId?: string; text?: string; error?: string; result?: GenResult }
    const requestId = payload.requestId
    if (!requestId) return
    const waiter = waiters.get(requestId)
    if (!waiter) return
    if (msg.type === 'gen.progress') {
      const text = friendlyProgress(payload.text || '')
      if (text) waiter.onProgress?.(text)
      return
    }
    if (msg.type === 'gen.result' && payload.result) {
      finish(requestId)
      waiter.resolve(payload.result)
      return
    }
    if (msg.type === 'gen.error') {
      finish(requestId)
      waiter.reject(new Error(payload.error || 'Generation failed'))
    }
  })
}

/** A line an app can show. Raw job states never leave the SDK. */
export function friendlyProgress(text: string): string | null {
  const line = text.replace(/\s+/g, ' ').trim()
  if (!line || line.startsWith('{') || line.startsWith('[')) return null
  if (line === 'Queued') return 'Getting ready…'
  if (line === 'Thinking') return 'Thinking…'
  if (line === 'Compiling' || line === 'Fixing the response' || /^Fixing compile error\b/i.test(line)) return 'Putting it together…'
  return line.length > 96 ? `${line.slice(0, 95).trim()}…` : line
}

function finish(requestId: string): void {
  const waiter = waiters.get(requestId)
  if (!waiter) return
  window.clearTimeout(waiter.timer)
  waiters.delete(requestId)
}

export function requestGeneration<T>(
  type: 'gen.request' | 'gen.open',
  req: GenRequest,
  onProgress?: (text: string) => void,
): Promise<GenResult<T>> {
  ensureListener()
  const requestId = `g${++seq}`
  const context = mergedContext(req.context)
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      waiters.delete(requestId)
      reject(new Error('Generation timed out'))
    }, 7 * 60 * 1000)
    waiters.set(requestId, {
      onProgress,
      resolve: (result) => resolve(result as GenResult<T>),
      reject,
      timer,
    })
    if (type === 'gen.open') {
      send('gen.open', { requestId, intent: req.intent, context, fresh: req.fresh, key: req.key })
    } else {
      send('gen.request', { requestId, req: { ...req, context } })
    }
  })
}
