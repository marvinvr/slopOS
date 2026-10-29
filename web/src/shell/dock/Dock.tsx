import { useEffect, useState, type MouseEvent } from 'react'
import { cx } from '../../design/kit/cx'
import { AppTile, DrawerGlyph } from '../icons'
import { openDrawer } from '../drawer'
import { ContextMenu, type MenuNode } from '../menu/MenuList'
import { useShell } from '../store'
import type { AppManifest } from '../types'

export function Dock() {
  const apps = useShell((state) => state.apps)
  const windows = useShell((state) => state.windows)
  const pins = useShell((state) => state.dockPins)
  const [menu, setMenu] = useState<{ x: number; y: number; appId: string } | null>(null)

  const pinned = pins.map((id) => apps.find((app) => app.id === id)).filter((app): app is AppManifest => Boolean(app))
  const running = apps
    .filter((app) => !pins.includes(app.id) && windows.some((win) => win.appId === app.id && win.phase !== 'closing'))
    .sort((a, b) => minZ(windows, a.id) - minZ(windows, b.id))
  const shown = [...pinned, ...running]
  const menuApp = menu ? apps.find((app) => app.id === menu.appId) : undefined

  const items: MenuNode[] = menuApp
    ? [
        { type: 'item', label: 'Open', onSelect: () => useShell.getState().openApp(menuApp.id) },
        {
          type: 'item',
          label: 'Close',
          disabled: !windows.some((win) => win.appId === menuApp.id && win.phase !== 'closing'),
          onSelect: () => useShell.getState().closeApp(menuApp.id),
        },
        { type: 'sep' },
        {
          type: 'item',
          label: 'Keep in Dock',
          checked: pins.includes(menuApp.id),
          onSelect: () => useShell.getState().toggleDockPin(menuApp.id),
        },
      ]
    : []

  return (
    <nav className="shell-dock" aria-label="Dock">
      {shown.map((app) => (
        <DockApp
          key={app.id}
          app={app}
          live={windows.some((win) => win.appId === app.id && win.phase !== 'closing')}
          menuOpen={menu?.appId === app.id}
          onMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setMenu({ x: event.clientX, y: event.clientY, appId: app.id })
          }}
        />
      ))}
      {shown.length > 0 ? <div className="shell-dock-sep" /> : null}
      <button type="button" className="shell-dock-btn" aria-label="Apps" onClick={() => openDrawer()}>
        <span className="shell-dock-tip">Apps</span>
        <span className="shell-drawer-glyph">
          <DrawerGlyph />
        </span>
      </button>
      {menu && items.length ? <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} /> : null}
    </nav>
  )
}

function DockApp({ app, live, menuOpen, onMenu }: { app: AppManifest; live: boolean; menuOpen: boolean; onMenu: (event: MouseEvent) => void }) {
  const pulse = useShell((state) => (state.pulse?.id === app.id ? state.pulse.n : 0))
  const openApp = useShell((state) => state.openApp)
  const [sprung, setSprung] = useState(false)

  useEffect(() => {
    if (!pulse) return
    setSprung(false)
    const frame = window.requestAnimationFrame(() => setSprung(true))
    const timer = window.setTimeout(() => setSprung(false), 280)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [pulse])

  return (
    <button
      type="button"
      className={cx('shell-dock-app', menuOpen && 'is-menu')}
      data-dock-app={app.id}
      aria-label={app.name}
      onClick={() => openApp(app.id)}
      onContextMenu={onMenu}
    >
      <span className="shell-dock-tip">{app.name}</span>
      <AppTile id={app.id} icon={app.icon} tint={app.tint} className={sprung ? 'is-spring' : undefined} />
      {live ? <span className="shell-dock-dot" /> : null}
    </button>
  )
}

function minZ(windows: { appId: string; z: number }[], appId: string): number {
  let z = Number.POSITIVE_INFINITY
  for (const win of windows) if (win.appId === appId) z = Math.min(z, win.z)
  return z
}
