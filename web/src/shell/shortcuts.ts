import { useEffect } from 'react'
import { toggleFullscreen } from './fullscreen'
import { dismissAll, dismissOne } from './layers'
import { welcomeSeen } from './local'
import { useShell } from './store'

// Global shortcuts live here. The runtime forwards the same chords from inside
// an app iframe (see runtime/sdk/host.ts), including unhandled Escape.
// Full screen is toggled on the chord below — no second listener.

export type ShortcutEvent = {
  key: string
  code?: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  repeat?: boolean
}

/** Ctrl/Cmd+Shift+F, and Ctrl+Cmd+F when the browser delivers it. */
export function isFullscreenChord(event: ShortcutEvent): boolean {
  if (event.altKey) return false
  if (event.key.toLowerCase() !== 'f' && event.code !== 'KeyF') return false
  if (event.shiftKey && (event.metaKey || event.ctrlKey)) return true
  return Boolean(event.metaKey && event.ctrlKey)
}

/** Ctrl/Cmd+Shift+A opens the app drawer. */
export function isDrawerChord(event: ShortcutEvent): boolean {
  if (event.altKey || !event.shiftKey) return false
  if (!(event.metaKey || event.ctrlKey)) return false
  return event.key.toLowerCase() === 'a' || event.code === 'KeyA'
}

export function isShellShortcut(event: ShortcutEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  const key = event.key.toLowerCase()
  return key === 'w' || key === 'm' || key === 'k' || key === ' ' || event.code === 'Space' || event.key === '`' || event.code === 'Backquote'
}

let lastSig = ''
let lastAt = 0
let lastEsc = 0

/** One Escape can arrive from the page and, a moment later, from an app iframe. */
function closeTopFromEscape(): boolean {
  const now = Date.now()
  if (now - lastEsc < 50) return false
  lastEsc = now
  return dismissOne()
}

export function runShortcut(event: ShortcutEvent): void {
  if (!welcomeSeen()) return
  if (event.repeat) return
  const sig = `${event.key}|${event.code ?? ''}|${event.metaKey}|${event.ctrlKey}|${event.shiftKey}`
  const now = Date.now()
  if (sig === lastSig && now - lastAt < 40) return
  lastSig = sig
  lastAt = now

  if (event.key === 'Escape') {
    closeTopFromEscape()
    return
  }
  if (isFullscreenChord(event)) {
    void toggleFullscreen()
    return
  }
  const shell = useShell.getState()
  if (isDrawerChord(event)) {
    const next = !shell.drawerOpen
    dismissAll()
    shell.setDrawerOpen(next)
    return
  }
  dismissAll()
  const key = event.key.toLowerCase()
  if (key === 'w') {
    if (shell.focusedWindowId) shell.closeWindow(shell.focusedWindowId)
    return
  }
  if (key === 'm') {
    if (shell.focusedWindowId) shell.minimizeWindow(shell.focusedWindowId)
    return
  }
  if (key === 'k' || key === ' ' || event.code === 'Space') {
    shell.setSpotlightOpen(!shell.spotlightOpen)
    return
  }
  if (event.key === '`' || event.code === 'Backquote') shell.cycleWindows()
}

export function useShellShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!welcomeSeen()) return
      if (event.key === 'Escape') {
        if (event.repeat) return
        if (closeTopFromEscape()) event.preventDefault()
        return
      }
      if (!isFullscreenChord(event) && !isShellShortcut(event) && !isDrawerChord(event)) return
      event.preventDefault()
      runShortcut(event)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
