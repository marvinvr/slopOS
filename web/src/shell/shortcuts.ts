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

export function isShortcutsChord(event: ShortcutEvent): boolean {
  if (event.altKey || event.shiftKey) return false
  if (!(event.metaKey || event.ctrlKey)) return false
  return event.key === '/' || event.code === 'Slash'
}

/** Ctrl/Cmd+Alt+arrows snap to a half, maximize, or restore. */
export function isSnapChord(event: ShortcutEvent): boolean {
  if (event.shiftKey || !event.altKey) return false
  if (!(event.metaKey || event.ctrlKey)) return false
  return event.key.startsWith('Arrow') || (event.code ?? '').startsWith('Arrow')
}

/** Ctrl/Cmd+` holds the window switcher. */
export function isCycleChord(event: ShortcutEvent): boolean {
  if (event.altKey || event.shiftKey) return false
  if (!(event.metaKey || event.ctrlKey)) return false
  return event.key === '`' || event.code === 'Backquote'
}

export function isShellShortcut(event: ShortcutEvent): boolean {
  if (isShortcutsChord(event) || isSnapChord(event) || isCycleChord(event)) return true
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  const key = event.key.toLowerCase()
  return key === 'w' || key === 'm' || key === 'k' || key === ' ' || event.code === 'Space'
}

function arrowOf(event: ShortcutEvent): 'left' | 'right' | 'up' | 'down' | null {
  const name = event.code?.startsWith('Arrow') ? event.code : event.key
  if (name === 'ArrowLeft') return 'left'
  if (name === 'ArrowRight') return 'right'
  if (name === 'ArrowUp') return 'up'
  if (name === 'ArrowDown') return 'down'
  return null
}

/** The modifier that opened the switcher commits the highlighted window. */
export function releaseModifier(key: string): void {
  const shell = useShell.getState()
  const sw = shell.switcher
  if (!sw) return
  const ctrl = key === 'Control' || key === 'Ctrl'
  const meta = key === 'Meta' || key === 'OS'
  if ((sw.mod === 'ctrl' && ctrl) || (sw.mod === 'meta' && meta)) shell.commitSwitcher()
}

function fresh(sig: string, windowMs: number): boolean {
  const now = Date.now()
  if (sig === lastSig && now - lastAt < windowMs) return false
  lastSig = sig
  lastAt = now
  return true
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

  if (isCycleChord(event)) {
    if (!fresh(`cycle|${event.ctrlKey ? 'ctrl' : 'meta'}`, event.repeat ? 16 : 40)) return
    const shell = useShell.getState()
    if (!shell.switcher) dismissAll()
    shell.advanceSwitcher(event.ctrlKey ? 'ctrl' : 'meta')
    return
  }

  if (event.repeat) return
  const sig = `${event.key}|${event.code ?? ''}|${event.metaKey}|${event.ctrlKey}|${event.altKey}|${event.shiftKey}`
  if (!fresh(sig, 40)) return

  if (event.key === 'Escape') {
    if (useShell.getState().switcher) {
      useShell.getState().cancelSwitcher()
      return
    }
    closeTopFromEscape()
    return
  }
  if (isSnapChord(event)) {
    const shell = useShell.getState()
    if (shell.switcher) shell.cancelSwitcher()
    const id = shell.focusedWindowId
    if (!id) return
    const dir = arrowOf(event)
    if (dir === 'left') shell.snapWindow(id, 'left')
    else if (dir === 'right') shell.snapWindow(id, 'right')
    else if (dir === 'up') shell.snapWindow(id, 'max')
    else if (dir === 'down') shell.restoreSnap(id)
    return
  }
  if (isFullscreenChord(event)) {
    void toggleFullscreen()
    return
  }
  const shell = useShell.getState()
  if (isDrawerChord(event)) {
    const next = !shell.drawerOpen
    if (shell.switcher) shell.cancelSwitcher()
    dismissAll()
    shell.setDrawerOpen(next)
    return
  }
  if (isShortcutsChord(event)) {
    const open = shell.shortcutsOpen
    if (shell.switcher) shell.cancelSwitcher()
    dismissAll()
    shell.setShortcutsOpen(!open)
    return
  }
  if (shell.switcher) shell.cancelSwitcher()
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
  }
}

export function useShellShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!welcomeSeen()) return
      if (event.key === 'Escape') {
        if (event.repeat) return
        if (useShell.getState().switcher) {
          useShell.getState().cancelSwitcher()
          event.preventDefault()
          return
        }
        if (closeTopFromEscape()) event.preventDefault()
        return
      }
      if (!isFullscreenChord(event) && !isShellShortcut(event) && !isDrawerChord(event)) return
      event.preventDefault()
      runShortcut(event)
    }
    const onUp = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.key === 'Meta' || event.key === 'OS') releaseModifier(event.key)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  }, [])
}
