const WELCOME_KEY = 'slop-welcomed'

type KeyboardNav = Navigator & {
  keyboard?: { lock?: () => Promise<void>; unlock?: () => void }
}

export function welcomeChoice(): 'full' | 'window' | null {
  try {
    const value = localStorage.getItem(WELCOME_KEY)
    return value === 'full' || value === 'window' ? value : null
  } catch {
    return 'window'
  }
}

export function rememberWelcome(choice: 'full' | 'window'): void {
  try {
    localStorage.setItem(WELCOME_KEY, choice)
  } catch {
    /* private mode */
  }
}

export function isFullscreen(): boolean {
  return Boolean(document.fullscreenElement)
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) (navigator as KeyboardNav).keyboard?.unlock?.()
})

export async function enterFullscreen(): Promise<void> {
  if (document.fullscreenElement) return
  await document.documentElement.requestFullscreen()
  const keyboard = (navigator as KeyboardNav).keyboard
  if (keyboard?.lock) {
    try {
      await keyboard.lock()
    } catch {
      /* Safari and Firefox have no Keyboard Lock. Ctrl shortcuts still work. */
    }
  }
}

export async function exitFullscreen(): Promise<void> {
  ;(navigator as KeyboardNav).keyboard?.unlock?.()
  if (document.fullscreenElement) await document.exitFullscreen()
}

export async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) await exitFullscreen()
  else await enterFullscreen()
}
