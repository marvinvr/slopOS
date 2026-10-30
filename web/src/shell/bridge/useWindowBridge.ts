import { useEffect, type RefObject } from 'react'
import { SLOP_PROTOCOL, type Interaction, type SlopMessage } from '../../../../runtime/protocol'
import { releaseModifier, runShortcut } from '../shortcuts'
import { useShell, type Win } from '../store'
import { goBack, goForward, interact, onRelease } from '../window/screens'

/** Messages from a window's screen: ready, forwarded shortcuts, history keys, and interactions. */
export function useWindowBridge(win: Win, iframeRef: RefObject<HTMLIFrameElement | null>): void {
  const mode = useShell((state) => state.resolved)
  const accent = useShell((state) => state.accent)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current?.contentWindow
      if (!frame || event.source !== frame) return
      const data = event.data as SlopMessage | null
      if (!data || data.slop !== SLOP_PROTOCOL) return
      if (data.winId && data.winId !== win.id) return
      handleMessage(win.id, data, frame)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [iframeRef, win.id])

  useEffect(() => onRelease(win.id, () => post(iframeRef.current?.contentWindow, { type: 'idle' })), [iframeRef, win.id])

  useEffect(() => {
    post(iframeRef.current?.contentWindow, { type: 'theme', payload: { mode, accent } })
  }, [iframeRef, mode, accent])
}

function post(frame: Window | null | undefined, message: { type: string; payload?: unknown }): void {
  frame?.postMessage({ slop: SLOP_PROTOCOL, ...message }, '*')
}

function handleMessage(winId: string, message: SlopMessage, frame: Window): void {
  const payload = (message.payload ?? {}) as Record<string, unknown>
  switch (message.type) {
    case 'ready': {
      const state = useShell.getState()
      post(frame, { type: 'theme', payload: { mode: state.resolved, accent: state.accent } })
      break
    }
    case 'interact': {
      const interaction = payload.interaction as Interaction | undefined
      if (!interaction || typeof interaction.label !== 'string') break
      const values = Array.isArray(payload.values) ? (payload.values as { field: string; value: string }[]) : []
      interact(winId, interaction, values, typeof payload.shown === 'string' ? payload.shown : '')
      break
    }
    case 'nav':
      if (payload.to === 'back') goBack(winId)
      else if (payload.to === 'forward') goForward(winId)
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
    default:
      break
  }
}
