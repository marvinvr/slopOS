import { useState } from 'react'
import { Icon } from '../../design/kit'
import { AppTile } from '../icons'
import { openDrawer } from '../drawer'
import { useShell } from '../store'

export function Dock() {
  const apps = useShell((state) => state.apps)
  const windows = useShell((state) => state.windows)
  const pins = useShell((state) => state.dockPins)
  const openApp = useShell((state) => state.openApp)
  const [sprung, setSprung] = useState<string | null>(null)

  function launch(id: string) {
    setSprung(id)
    window.setTimeout(() => setSprung((current) => (current === id ? null : current)), 240)
    openApp(id)
  }

  const pinned = pins.map((id) => apps.find((app) => app.id === id)).filter((app): app is NonNullable<typeof app> => Boolean(app))
  const running = apps.filter(
    (app) => !pinned.some((pin) => pin.id === app.id) && windows.some((win) => win.appId === app.id && win.phase !== 'closing'),
  )
  const shown = [...pinned, ...running]

  return (
    <nav className="shell-dock" aria-label="Dock">
      {shown.map((app) => {
        const live = windows.some((win) => win.appId === app.id && win.phase !== 'closing')
        return (
          <button key={app.id} type="button" className="shell-dock-app" data-dock-app={app.id} title={app.name} onClick={() => launch(app.id)}>
            <AppTile id={app.id} icon={app.icon} tint={app.tint} className={sprung === app.id ? 'is-spring' : undefined} />
            {live ? <span className="shell-dock-dot" /> : null}
          </button>
        )
      })}
      {shown.length > 0 ? <div className="shell-dock-sep" /> : null}
      <button type="button" className="shell-dock-btn" aria-label="Apps" onClick={() => openDrawer()}>
        <span className="shell-drawer-glyph">
          <Icon name="LayoutGrid" size={22} />
        </span>
      </button>
    </nav>
  )
}
