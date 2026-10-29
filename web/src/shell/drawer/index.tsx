import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Icon } from '../../design/kit'
import { cx } from '../../design/kit/cx'
import { scoreApp } from '../fuzzy'
import { openEditApp, regenerateApp, startGeneration } from '../generation'
import { AppTile } from '../icons'
import { pushLayer } from '../layers'
import { ContextMenu, type MenuNode } from '../menu/MenuList'
import { useShell } from '../store'
import { Invite } from '../empty/Invite'

export function openDrawer(): void {
  useShell.getState().setDrawerOpen(true)
}

export function Drawer() {
  const open = useShell((state) => state.drawerOpen)
  const close = useShell((state) => state.setDrawerOpen)
  const apps = useShell((state) => state.apps)
  const openApp = useShell((state) => state.openApp)
  const drawerPrompt = useShell((state) => state.drawerPrompt)
  const setDrawerPrompt = useShell((state) => state.setDrawerPrompt)
  const setShellPrompt = useShell((state) => state.setShellPrompt)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [byKeyboard, setByKeyboard] = useState(false)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; appId: string } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(6)

  const shown = useMemo(() => {
    const q = query.trim()
    const ranked = apps
      .map((app) => ({ app, score: scoreApp(q, app.name, app.description) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => (q ? b.score - a.score : a.app.name.localeCompare(b.app.name)))
    return ranked.map((item) => item.app)
  }, [apps, query])

  const count = shown.length + 1

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, count - 1)))
  }, [count])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    setByKeyboard(false)
    setMenu(null)
    if (useShell.getState().drawerPrompt) return
    const timer = window.setTimeout(() => searchRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open || !drawerPrompt) return
    setComposing(true)
    setDraft('')
    setDrawerPrompt(false)
  }, [open, drawerPrompt, setDrawerPrompt])

  useEffect(() => {
    if (!open) return
    return pushLayer(() => close(false))
  }, [open, close])

  useEffect(() => {
    const el = gridRef.current
    if (!el || !open) return
    const measure = () => {
      const styles = getComputedStyle(el)
      const gap = Number.parseFloat(styles.columnGap) || 18
      const tile = el.querySelector('.shell-drawer-app')
      const tileWidth = tile?.getBoundingClientRect().width || 112
      setCols(Math.max(1, Math.floor((el.clientWidth + gap) / (tileWidth + gap))))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [open, apps.length])

  if (!open) return null

  function move(delta: number) {
    setByKeyboard(true)
    setActive((current) => (current + delta + count) % count)
  }

  function activate(index: number) {
    if (index <= 0) {
      setComposing(true)
      setDraft('')
      return
    }
    const app = shown[index - 1]
    if (!app) return
    openApp(app.id)
  }

  function submitDraft() {
    const prompt = draft.trim()
    if (!prompt) return
    startGeneration(prompt)
    close(false)
  }

  function onKeyDown(event: ReactKeyboardEvent) {
    if (composing) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setComposing(false)
      }
      return
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault()
      setQuery((current) => current + event.key)
      searchRef.current?.focus()
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      move(1)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      move(-1)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(cols)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-cols)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      activate(active)
    }
  }

  function openMenu(event: ReactMouseEvent, appId: string) {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, appId })
  }

  const menuApp = menu ? apps.find((app) => app.id === menu.appId) : undefined
  const menuItems: MenuNode[] = menuApp
    ? [
        { type: 'item', label: 'Open', onSelect: () => openApp(menuApp.id) },
        { type: 'item', label: 'Edit with Grok…', onSelect: () => openEditApp(menuApp.id) },
        { type: 'item', label: 'Regenerate', onSelect: () => regenerateApp(menuApp.id) },
        { type: 'item', label: 'Version History…', onSelect: () => setShellPrompt({ kind: 'history', appId: menuApp.id }) },
        { type: 'sep' },
        { type: 'item', label: 'Delete', danger: true, onSelect: () => setShellPrompt({ kind: 'delete', appId: menuApp.id }) },
      ]
    : []

  return (
    <div className="shell-backdrop drawer" onPointerDown={() => close(false)}>
      <div
        className="shell-drawer"
        role="dialog"
        aria-label="Apps"
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.stopPropagation()
          if (event.target === event.currentTarget) close(false)
        }}
      >
        {apps.length === 0 ? (
          <Invite embedded onPick={() => close(false)} />
        ) : (
          <h2 className="shell-drawer-title">Apps</h2>
        )}
        <label className="shell-drawer-search">
          <Icon name="Search" size={15} />
          <input ref={searchRef} value={query} placeholder="Search apps" aria-label="Search apps" spellCheck={false} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="shell-drawer-grid" ref={gridRef}>
          {composing ? (
            <form
              className="shell-drawer-compose"
              onSubmit={(event) => {
                event.preventDefault()
                submitDraft()
              }}
            >
              <input
                autoFocus
                value={draft}
                placeholder="Describe an app…"
                aria-label="New app"
                onChange={(event) => setDraft(event.target.value)}
              />
            </form>
          ) : (
            <button type="button" className={cx('shell-drawer-app', byKeyboard && active === 0 && 'is-kbd')} onClick={() => activate(0)} onMouseEnter={() => { setByKeyboard(false); setActive(0) }}>
              <span className="shell-tile shell-new-tile">
                <Icon name="Plus" size={26} />
              </span>
              <span>New app…</span>
            </button>
          )}
          {shown.map((app, index) => (
            <div
              key={app.id}
              data-app-id={app.id}
              className={cx('shell-drawer-app', byKeyboard && active === index + 1 && 'is-kbd')}
              onMouseEnter={() => {
                setByKeyboard(false)
                setActive(index + 1)
              }}
              onContextMenu={(event) => openMenu(event, app.id)}
            >
              <button type="button" className="shell-drawer-hit" onClick={() => activate(index + 1)}>
                <AppTile id={app.id} icon={app.icon} tint={app.tint} size={60} />
                <span>{app.name}</span>
              </button>
              <button
                type="button"
                className="shell-drawer-more"
                aria-label={`Actions for ${app.name}`}
                onClick={(event) => openMenu(event, app.id)}
              >
                <Icon name="Ellipsis" size={14} />
              </button>
            </div>
          ))}
        </div>
        {query.trim() && shown.length === 0 ? <p className="shell-drawer-empty">No apps match.</p> : null}
      </div>
      {menu && menuItems.length ? <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} /> : null}
    </div>
  )
}
