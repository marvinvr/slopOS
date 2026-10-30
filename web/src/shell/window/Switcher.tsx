import { cx } from '../../design/kit/cx'
import { AppTile } from '../icons'
import { useShell, type Win } from '../store'

export function Switcher() {
  const switcher = useShell((state) => state.switcher)
  const windows = useShell((state) => state.windows)
  const apps = useShell((state) => state.apps)
  if (!switcher) return null

  const tiles = switcher.ids
    .map((id) => windows.find((win) => win.id === id))
    .filter((win): win is Win => Boolean(win))

  return (
    <div className="shell-switcher-layer">
      <div className="shell-switcher" role="listbox" aria-label="Switch window">
        {tiles.map((win, index) => {
          const app = apps.find((item) => item.id === win.appId)
          const name = app?.name || win.title
          const count = windows.filter((item) => item.appId === win.appId && item.phase !== 'closing').length
          const selected = index === switcher.index
          return (
            <button
              key={win.id}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={count > 1 ? `${name}, ${count} windows` : name}
              className={cx('shell-switcher-tile', selected && 'is-selected')}
              onMouseEnter={() => useShell.getState().setSwitcherIndex(index)}
              onClick={() => useShell.getState().commitSwitcher(index)}
            >
              <span className="shell-switcher-icon">
                {app ? <AppTile id={app.id} icon={app.icon} tint={app.tint} size={64} /> : null}
                {count > 1 ? <span className="shell-switcher-count">{count}</span> : null}
              </span>
              <span className="shell-switcher-name">{name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
