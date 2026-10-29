import { clearSlopLocalStorage } from './local'
import { useShell } from './store'
import { nextWallpaper } from './wallpaper/wallpapers'

export function toggleDarkMode(): void {
  const { theme, resolved, setTheme } = useShell.getState()
  const dark = theme === 'dark' || (theme === 'auto' && resolved === 'dark')
  setTheme(dark ? 'light' : 'dark')
}

export function cycleWallpaper(): void {
  const { wallpaper, setWallpaper } = useShell.getState()
  setWallpaper(nextWallpaper(wallpaper))
}

export async function deleteApp(appId: string): Promise<boolean> {
  const res = await fetch(`/api/apps/${encodeURIComponent(appId)}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    useShell.getState().pushToast('Couldn’t delete the app', body?.error || 'Try again in a moment.')
    return false
  }
  useShell.getState().forgetApp(appId)
  return true
}

export async function resetWorld(): Promise<boolean> {
  let res: Response
  try {
    res = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'RESET' }),
    })
  } catch {
    useShell.getState().pushToast('Couldn’t reset slopOS', 'The server didn’t answer.')
    return false
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    useShell.getState().pushToast('Couldn’t reset slopOS', body?.error || 'The world is still here.')
    return false
  }
  clearSlopLocalStorage()
  window.location.reload()
  return true
}
