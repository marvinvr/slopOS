import { useEffect, useState, type MouseEvent } from 'react'
import { applyTheme, resolveTheme } from '../design/theme'
import { cycleWallpaper, toggleDarkMode } from './actions'
import { GenerationActivity } from './generation'
import { Dock } from './dock/Dock'
import { ShellDialogs } from './dialogs/Dialogs'
import { AboutDialog } from './menu/AboutDialog'
import { ShortcutsDialog } from './menu/ShortcutsDialog'
import { Drawer } from './drawer'
import { MenuBar } from './menu/MenuBar'
import { ContextMenu, type MenuNode } from './menu/MenuList'
import { useShellShortcuts } from './shortcuts'
import { Spotlight } from './spotlight'
import { bootShell, useShell } from './store'
import { Toasts } from './toasts/Toasts'
import { Wallpaper } from './wallpaper/Wallpaper'
import { Switcher } from './window/Switcher'
import { WindowManager } from './window/WindowManager'

export function Desktop() {
  const interacting = useShell((state) => state.interacting)
  const drawerOpen = useShell((state) => state.drawerOpen)
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
    if (target.closest('.shell-window, .shell-dock, .shell-menubar, .shell-backdrop, .shell-about, .shell-toast, .shell-menu-pop, .shell-confirm, .shell-confirm-backdrop, .shell-switcher, .shell-switcher-layer')) {
      return
    }
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY })
  }

  const items: MenuNode[] = [
    { type: 'item', label: 'Show All Apps', onSelect: () => useShell.getState().setDrawerOpen(true) },
    { type: 'item', label: 'Change Wallpaper', onSelect: cycleWallpaper },
    { type: 'item', label: 'Toggle Dark Mode', onSelect: toggleDarkMode },
  ]

  return (
    <div className={['shell-desktop', interacting && 'is-interacting', drawerOpen && 'is-drawer'].filter(Boolean).join(' ')} onContextMenu={onContextMenu}>
      <Wallpaper />
      <WindowManager />
      <Switcher />
      <MenuBar />
      <Dock />
      <Toasts />
      <Spotlight />
      <Drawer />
      <AboutDialog />
      <ShortcutsDialog />
      <ShellDialogs />
      <GenerationActivity />
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} /> : null}
    </div>
  )
}
