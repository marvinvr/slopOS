import { cx } from '../../design/kit/cx'
import { AppTile } from '../icons'
import { useShell } from '../store'

export function Switcher() {
  const switcher = useShell((state) => state.switcher)
  const windows = useShell((state) => state.windows)
  const apps = useShell((state) => state.apps)
  if (!switcher) return null

  const tiles = switcher.ids
    .map((id) => windows.find((win) => win.id === id))
    .filter((win): win is NonNullable<typeof win> => Boolean(win))

  return (
    <div className="shell-switcher" role="listbox" aria-label="Switch window">
      {tiles.map((win, index) => {
        const app = apps.find((item) => item.id === win.appId)
        const selected = index === switcher.index
        return (
          <button
            key={win.id}
            type="button"
            role="option"
            aria-selected={selected}
            className={cx('shell-switcher-tile', selected && 'is-selected')}
            onMouseEnter={() => useShell.getState().setSwitcherIndex(index)}
            onClick={() => useShell.getState().commitSwitcher(index)}
          >
            {app ? <AppTile id={app.id} icon={app.icon} tint={app.tint} size={36} /> : null}
            <span className="shell-switcher-title">{win.title}</span>
          </button>
        )
      })}
    </div>
  )
}
