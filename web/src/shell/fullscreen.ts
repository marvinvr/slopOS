import { useEffect, useState } from 'react'
import { useShell } from './store'

type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void }
type KeyboardLock = { lock?: () => Promise<void>; unlock?: () => void }

function keyboard(): KeyboardLock | undefined {
  return (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard
}

export function fullscreenElement(): Element | null {
  const doc = document as FullscreenDocument
  return document.fullscreenElement || doc.webkitFullscreenElement || null
}

function unlockKeyboard(): void {
  try {
    keyboard()?.unlock?.()
  } catch {
    /* already unlocked */
  }
}

export async function enterFullscreen(): Promise<void> {
  if (fullscreenElement()) return
  const root = document.documentElement as FullscreenElement
  try {
    if (root.requestFullscreen) await root.requestFullscreen()
    else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen()
    else throw new Error('unsupported')
  } catch {
    useShell.getState().pushToast('Couldn’t enter full screen', 'The browser blocked the request.')
    return
  }
  try {
    await keyboard()?.lock?.()
  } catch {
    /* Safari and Firefox have no Keyboard Lock. Ctrl shortcuts still work. */
  }
}

export async function exitFullscreen(): Promise<void> {
  if (!fullscreenElement()) return
  const doc = document as FullscreenDocument
  try {
    if (document.exitFullscreen) await document.exitFullscreen()
    else await doc.webkitExitFullscreen?.()
  } catch {
    /* already left */
  }
}

export async function toggleFullscreen(): Promise<void> {
  if (fullscreenElement()) await exitFullscreen()
  else await enterFullscreen()
}

export function useFullscreen(): boolean {
  const [on, setOn] = useState(() => Boolean(fullscreenElement()))
  useEffect(() => {
    const sync = () => {
      const active = Boolean(fullscreenElement())
      setOn(active)
      if (!active) unlockKeyboard()
    }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])
  return on
}
