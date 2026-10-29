import { useEffect } from 'react'
import { useShell } from './store'

// Global shortcuts live here. The runtime forwards the same chords from inside
// an app iframe (see runtime/sdk/host.ts), including unhandled Escape.
// TODO(pass A): full-screen toggle on the fullscreen chord below (logo menu,
// welcome, Fullscreen API, keyboard.lock). Do not add another key listener for it.

export type ShortcutEvent = {
  key: string
  code?: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

/** Ctrl/Cmd+Shift+F, and Ctrl+Cmd+F when the browser delivers it. */
export function isFullscreenChord(event: ShortcutEvent): boolean {
  if (event.altKey) return false
  if (event.key.toLowerCase() !== 'f' && event.code !== 'KeyF') return false
  if (event.shiftKey && (event.metaKey || event.ctrlKey)) return true
  return Boolean(event.metaKey && event.ctrlKey)
}

export function isShellShortcut(event: ShortcutEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  const key = event.key.toLowerCase()
  return key === 'w' || key === 'm' || key === 'k' || key === ' ' || event.code === 'Space' || event.key === '`' || event.code === 'Backquote'
}

/** Close shell popovers. Returns whether anything was open. */
function dismissPopovers(): boolean {
  const shell = useShell.getState()
  if (!shell.spotlightOpen && !shell.drawerOpen && !shell.aboutOpen) return false
  shell.setSpotlightOpen(false)
  shell.setDrawerOpen(false)
  shell.setAboutOpen(false)
  return true
}

export function runShortcut(event: ShortcutEvent): void {
  if (event.key === 'Escape') {
    dismissPopovers()
    return
  }
  if (isFullscreenChord(event)) {
    // TODO(pass A): toggle full screen.
    return
  }
  const shell = useShell.getState()
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
      if (event.key === 'Escape') {
        if (dismissPopovers()) event.preventDefault()
        return
      }
      if (!isFullscreenChord(event) && !isShellShortcut(event)) return
      event.preventDefault()
      runShortcut(event)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
