import { useMemo, useState } from 'react'
import { Input } from '../../design/kit'
import { Invite } from '../empty/Invite'
import { AppTile } from '../icons'
import { useShell } from '../store'

/**
 * TODO(pass A): full app drawer.
 * Still to build: fuzzy search, right-click / … menu (Edit with prompt, Regenerate,
 * Version history, Delete), and the polished "New app" tile. Launching and the
 * empty state live here so the desk works before that pass.
 */
export function openDrawer(): void {
  useShell.getState().setDrawerOpen(true)
}

export function Drawer() {
  const open = useShell((state) => state.drawerOpen)
  const close = useShell((state) => state.setDrawerOpen)
  const apps = useShell((state) => state.apps)
  const openApp = useShell((state) => state.openApp)
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return apps
    return apps.filter((app) => `${app.name} ${app.description ?? ''}`.toLowerCase().includes(q))
  }, [apps, query])

  if (!open) return null
  return (
    <div className="shell-backdrop drawer" onPointerDown={() => close(false)}>
      <div className="shell-drawer" role="dialog" aria-label="Apps" onPointerDown={(event) => event.stopPropagation()}>
        <div className="shell-drawer-head">
          <h2>Apps</h2>
        </div>
        {apps.length === 0 ? (
          <Invite embedded />
        ) : (
          <>
            <Input value={query} onChange={setQuery} placeholder="Search apps" aria-label="Search apps" />
            <div className="shell-drawer-grid" style={{ marginTop: 12 }}>
              {shown.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className="shell-drawer-app"
                  onClick={() => {
                    openApp(app.id)
                    close(false)
                  }}
                >
                  <AppTile id={app.id} icon={app.icon} tint={app.tint} size={52} />
                  <span>{app.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
