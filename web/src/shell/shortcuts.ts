import { useEffect } from 'react'
import { toggleFullscreen } from './fullscreen'
import { useShell } from './store'

// TODO(pass A): shortcut polish — chord conflicts, menu shortcut hints, and the full map.

type ShortcutEvent = { key: string; code?: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }

export function isShellShortcut(event: ShortcutEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  const key = event.key.toLowerCase()
  return key === 'w' || key === 'm' || key === 'k' || key === ' ' || event.code === 'Space' || event.key === '`' || event.code === 'Backquote'
}

export function runShortcut(event: { key: string; code?: string }): void {
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
        const shell = useShell.getState()
        if (shell.spotlightOpen || shell.drawerOpen || shell.aboutOpen) {
          shell.setSpotlightOpen(false)
          shell.setDrawerOpen(false)
          shell.setAboutOpen(false)
          event.preventDefault()
        }
        return
      }
      const key = event.key.toLowerCase()
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.shiftKey && key === 'f') {
        event.preventDefault()
        void toggleFullscreen()
        return
      }
      if (event.metaKey && event.ctrlKey && key === 'f') {
        event.preventDefault()
        void toggleFullscreen()
        return
      }
      if (!isShellShortcut(event)) return
      event.preventDefault()
      runShortcut(event)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
