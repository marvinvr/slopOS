import { useEffect, type RefObject } from 'react'
import { SLOP_PROTOCOL, type SlopMessage, type WireMenu } from '../../../../runtime/protocol'
import { routeActionMessage } from './actions'
import { routeGenMessage } from './gen'
import { releaseModifier, runShortcut } from '../shortcuts'
import { useShell, type Win } from '../store'

export function useWindowBridge(win: Win, iframeRef: RefObject<HTMLIFrameElement | null>): void {
  const mode = useShell((state) => state.resolved)
  const accent = useShell((state) => state.accent)
  const focused = useShell((state) => state.focusedWindowId === win.id && win.phase === 'open')

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current?.contentWindow
      if (!frame || event.source !== frame) return
      const data = event.data as SlopMessage | null
      if (!data || data.slop !== SLOP_PROTOCOL) return
      if (data.winId && data.winId !== win.id) return
      // Read the window at message time: a window that opened before its app existed changes appId in place.
      const current = useShell.getState().windows.find((item) => item.id === win.id) ?? win
      void handleMessage(current, data, (payload) => {
        if (!data.id) return
        frame.postMessage({ slop: SLOP_PROTOCOL, type: 'response', id: data.id, payload }, '*')
      })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [iframeRef, win.id])

  useEffect(() => {
    post(iframeRef.current, { type: 'theme', payload: { mode, accent } })
  }, [iframeRef, mode, accent])

  useEffect(() => {
    post(iframeRef.current, { type: 'focus', payload: { focused } })
  }, [iframeRef, focused])
}

function post(frame: HTMLIFrameElement | null, message: { type: string; payload?: unknown }): void {
  frame?.contentWindow?.postMessage({ slop: SLOP_PROTOCOL, ...message }, '*')
}

const pendingGenerative = new Map<string, { intent: string; context?: unknown }>()

/** Ask an open app to generate this intent once its frame is listening. */
export function queueGenerative(winId: string, intent: string, context?: unknown): void {
  pendingGenerative.set(winId, { intent, context })
}

/** Post into a live app frame. Returns false when that frame is not mounted yet. */
export function postToWindow(winId: string, message: { type: string; payload?: unknown }): boolean {
  const frame = document.querySelector<HTMLIFrameElement>(`iframe[data-win="${winId}"]`)
  if (!frame?.contentWindow) return false
  post(frame, message)
  return true
}

async function handleMessage(win: Win, message: SlopMessage, reply: (payload: unknown) => void): Promise<void> {
  const frame = document.querySelector<HTMLIFrameElement>(`iframe[data-win="${win.id}"]`)
  const tell = (next: { type: string; payload?: unknown }) => post(frame, next)
  if (await routeGenMessage(win, message, tell)) return
  if (await routeActionMessage(message, reply)) return
  const shell = useShell.getState()
  const payload = (message.payload ?? {}) as Record<string, unknown>
  switch (message.type) {
    case 'ready': {
      const state = useShell.getState()
      const current = state.windows.find((item) => item.id === win.id)
      const app = state.apps.find((item) => item.id === win.appId)
      post(frame, { type: 'theme', payload: { mode: state.resolved, accent: state.accent } })
      post(frame, { type: 'focus', payload: { focused: state.focusedWindowId === win.id } })
      post(frame, {
        type: 'screens.restore',
        payload: { screens: current?.screens ?? [], appName: app?.name ?? current?.title ?? win.appId },
      })
      const pending = pendingGenerative.get(win.id)
      if (pending) {
        pendingGenerative.delete(win.id)
        post(frame, { type: 'generative.open', payload: pending })
      }
      break
    }
    case 'setTitle':
      if (typeof payload.title === 'string') shell.setTitle(win.id, payload.title)
      break
    case 'setSize': {
      const width = Number(payload.width)
      const height = Number(payload.height)
      if (!Number.isFinite(width) || !Number.isFinite(height)) break
      shell.setGeometry(win.id, {
        width: Math.max(win.minWidth, Math.round(width)),
        height: Math.max(win.minHeight, Math.round(height)),
      })
      break
    }
    case 'close':
      shell.closeWindow(win.id)
      break
    case 'notify':
      if (typeof payload.title === 'string') {
        shell.pushToast(payload.title, typeof payload.body === 'string' ? payload.body : undefined, win.appId)
      }
      break
    case 'menu.set':
      shell.setMenus(win.id, Array.isArray(payload.menus) ? (payload.menus as WireMenu[]) : [])
      break
    case 'error':
      shell.setWindowError(win.id, {
        message: typeof payload.message === 'string' ? payload.message : 'Something went wrong',
        stack: typeof payload.stack === 'string' ? payload.stack : undefined,
      })
      break
    case 'keydown':
      runShortcut({
        key: String(payload.key ?? ''),
        code: typeof payload.code === 'string' ? payload.code : '',
        metaKey: Boolean(payload.metaKey),
        ctrlKey: Boolean(payload.ctrlKey),
        shiftKey: Boolean(payload.shiftKey),
        altKey: Boolean(payload.altKey),
        repeat: Boolean(payload.repeat),
      })
      break
    case 'keyup':
      releaseModifier(String(payload.key ?? ''))
      break
    case 'storage.get': {
      const key = String(payload.key ?? '')
      const res = await fetch(`/api/storage/${win.appId}/${encodeURIComponent(key)}`)
      const body = (await res.json().catch(() => null)) as { found?: boolean; value?: unknown } | null
      if (!res.ok || !body || body.found === false) reply({ found: false })
      else reply(body)
      break
    }
    case 'storage.set':
      await fetch(`/api/storage/${win.appId}/${encodeURIComponent(String(payload.key ?? ''))}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: payload.value }),
      })
      reply({ ok: true })
      break
    case 'storage.remove':
      await fetch(`/api/storage/${win.appId}/${encodeURIComponent(String(payload.key ?? ''))}`, { method: 'DELETE' })
      reply({ ok: true })
      break
    case 'storage.keys': {
      const res = await fetch(`/api/storage/${win.appId}`)
      const body = (await res.json()) as { data?: Record<string, unknown> }
      reply({ keys: Object.keys(body.data ?? {}) })
      break
    }
    case 'storage.read': {
      const appId = typeof payload.appId === 'string' ? payload.appId : ''
      const key = typeof payload.key === 'string' ? payload.key : ''
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(appId) || !key || /[\\/]/.test(key)) {
        reply({ found: false })
        break
      }
      const res = await fetch(`/api/storage/${appId}/${encodeURIComponent(key)}`)
      const body = (await res.json().catch(() => null)) as { found?: boolean; value?: unknown } | null
      if (!res.ok || !body || body.found === false) reply({ found: false })
      else reply(body)
      break
    }
    case 'fetch': {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: payload.url,
          method: payload.method,
          headers: payload.headers,
          body: payload.body,
        }),
      })
      const body = (await res.json()) as { error?: string; status?: number; headers?: Record<string, string>; body?: string }
      if (!res.ok) reply({ error: body.error || 'request failed' })
      else reply(body)
      break
    }
    default:
      break
  }
}
