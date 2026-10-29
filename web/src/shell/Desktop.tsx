import { useEffect, useState, type MouseEvent } from 'react'
import { applyTheme, resolveTheme } from '../design/theme'
import { cycleWallpaper, toggleDarkMode } from './actions'
import { providerLabel, useGrokStatus } from './generation'
import { Dock } from './dock/Dock'
import { ShellDialogs } from './dialogs/Dialogs'
import { AboutDialog } from './menu/AboutDialog'
import { Drawer } from './drawer'
import { Invite } from './empty/Invite'
import { MenuBar } from './menu/MenuBar'
import { ContextMenu, type MenuNode } from './menu/MenuList'
import { useShellShortcuts } from './shortcuts'
import { Spotlight } from './spotlight'
import { bootShell, useShell } from './store'
import { Toasts } from './toasts/Toasts'
import { Wallpaper } from './wallpaper/Wallpaper'
import { Welcome } from './welcome/Welcome'
import { WindowManager } from './window/WindowManager'

export function Desktop() {
  const loaded = useShell((state) => state.loaded)
  const provider = providerLabel(useGrokStatus().provider)
  const apps = useShell((state) => state.apps)
  const interacting = useShell((state) => state.interacting)
  const theme = useShell((state) => state.theme)
  const accent = useShell((state) => state.accent)
  useShellShortcuts()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

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

  function onContextMenu(event: MouseEvent) {
    const target = event.target as HTMLElement
    if (target.closest('.shell-window, .shell-dock, .shell-menubar, .shell-backdrop, .shell-about, .shell-toast, .shell-menu-pop, .shell-welcome, .shell-confirm, .shell-confirm-backdrop')) {
      return
    }
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY })
  }

  const items: MenuNode[] = [
    { type: 'item', label: 'Show All Apps', onSelect: () => useShell.getState().setDrawerOpen(true) },
    {
      type: 'item',
      label: `New App with ${provider}…`,
      onSelect: () => {
        const shell = useShell.getState()
        shell.setDrawerPrompt(true)
        shell.setDrawerOpen(true)
      },
    },
    { type: 'item', label: 'Change Wallpaper', onSelect: cycleWallpaper },
    { type: 'item', label: 'Toggle Dark Mode', onSelect: toggleDarkMode },
  ]

  return (
    <div className={interacting ? 'shell-desktop is-interacting' : 'shell-desktop'} onContextMenu={onContextMenu}>
      <Wallpaper />
      {loaded && apps.length === 0 ? <Invite /> : null}
      <WindowManager />
      <MenuBar />
      <Dock />
      <Toasts />
      <Spotlight />
      <Drawer />
      <AboutDialog />
      <ShellDialogs />
      <Welcome />
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} /> : null}
    </div>
  )
}
