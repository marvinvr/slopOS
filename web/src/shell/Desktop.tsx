import { useEffect } from 'react'
import { applyTheme, resolveTheme } from '../design/theme'
import { Dock } from './dock/Dock'
import { AboutDialog } from './menu/AboutDialog'
import { Drawer } from './drawer'
import { Invite } from './empty/Invite'
import { MenuBar } from './menu/MenuBar'
import { useShellShortcuts } from './shortcuts'
import { Spotlight } from './spotlight'
import { bootShell, useShell } from './store'
import { Toasts } from './toasts/Toasts'
import { Wallpaper } from './wallpaper/Wallpaper'
import { WindowManager } from './window/WindowManager'

export function Desktop() {
  const loaded = useShell((state) => state.loaded)
  const apps = useShell((state) => state.apps)
  const interacting = useShell((state) => state.interacting)
  const theme = useShell((state) => state.theme)
  const accent = useShell((state) => state.accent)
  useShellShortcuts()

  useEffect(() => {
    void bootShell()
  }, [])

  useEffect(() => {
    const apply = () => {
      const mode = resolveTheme(useShell.getState().theme)
      useShell.setState({ resolved: mode })
      applyTheme(mode, useShell.getState().accent)
      try {
        localStorage.setItem('slop-theme', useShell.getState().theme)
      } catch {
        /* private mode */
      }
    }
    apply()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (useShell.getState().theme === 'auto') apply()
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme, accent])

  return (
    <div className={interacting ? 'shell-desktop is-interacting' : 'shell-desktop'}>
      <Wallpaper />
      {loaded && apps.length === 0 ? <Invite /> : null}
      <WindowManager />
      <MenuBar />
      <Dock />
      <Toasts />
      <Spotlight />
      <Drawer />
      <AboutDialog />
    </div>
  )
}
