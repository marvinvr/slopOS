import { SLOP_PROTOCOL, type SlopMessage } from '../protocol'

const params = new URLSearchParams(location.search)

export const frameAppId = params.get('app') ?? ''
export const frameWinId = params.get('win') ?? ''
export const frameVersion = params.get('v') ?? ''

type Waiter = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: number }

const pending = new Map<string, Waiter>()
const listeners = new Set<(msg: SlopMessage) => void>()
let seq = 0

export function send(type: string, payload?: unknown): void {
  parent.postMessage({ slop: SLOP_PROTOCOL, type, winId: frameWinId, payload }, '*')
}

export function rpc<T>(type: string, payload?: unknown): Promise<T> {
  const id = `r${++seq}`
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id)
      reject(new Error(`No reply for ${type}`))
    }, 20_000)
    pending.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
      timer,
    })
    parent.postMessage({ slop: SLOP_PROTOCOL, type, id, winId: frameWinId, payload }, '*')
  })
}

export function onHostMessage(fn: (msg: SlopMessage) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function reportError(message: string, stack?: string): void {
  send('error', { message, stack })
}

/** Shortcuts the frame must hand to the shell. Ctrl works even when the browser eats Cmd. */
export function isForwardedShortcut(event: KeyboardEvent): boolean {
  if (event.altKey) return false
  const key = event.key.toLowerCase()
  const mod = event.metaKey || event.ctrlKey
  if (!mod) return false
  // Pass A toggles full screen. Both chords, so a browser that eats one still delivers the other.
  if (key === 'f' && (event.shiftKey || (event.metaKey && event.ctrlKey))) return true
  if (event.shiftKey) return false
  return key === 'w' || key === 'm' || key === 'k' || key === ' ' || event.code === 'Space' || event.key === '`' || event.code === 'Backquote'
}

export function shortcutPayload(event: KeyboardEvent) {
  return {
    key: event.key,
    code: event.code,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== parent) return
  const data = event.data as SlopMessage | null
  if (!data || data.slop !== SLOP_PROTOCOL) return
  if (data.type === 'response' && data.id) {
    const waiter = pending.get(data.id)
    if (!waiter) return
    pending.delete(data.id)
    window.clearTimeout(waiter.timer)
    waiter.resolve(data.payload)
    return
  }
  for (const fn of listeners) fn(data)
})
