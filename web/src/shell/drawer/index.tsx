import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Icon } from '../../design/kit'
import { cx } from '../../design/kit/cx'
import { launch, uninstalled, type CatalogApp } from '../catalog'
import { GOOD_MATCH, scoreApp } from '../fuzzy'
import { openEditApp, regenerateApp, titleFor } from '../generation'
import { AppTile } from '../icons'
import { pushLayer } from '../layers'
import { ContextMenu, type MenuNode } from '../menu/MenuList'
import { useShell } from '../store'
import type { AppManifest } from '../types'

type Entry =
  | { kind: 'app'; app: AppManifest }
  | { kind: 'catalog'; entry: CatalogApp }
  | { kind: 'typed'; id: string; name: string; prompt: string }

function entryId(item: Entry): string {
  if (item.kind === 'app') return item.app.id
  return item.kind === 'catalog' ? item.entry.id : item.id
}

function entryName(item: Entry): string {
  if (item.kind === 'app') return item.app.name
  return item.kind === 'catalog' ? item.entry.name : item.name
}

export function openDrawer(): void {
  useShell.getState().setDrawerOpen(true)
}

export function Drawer() {
  const open = useShell((state) => state.drawerOpen)
  const close = useShell((state) => state.setDrawerOpen)
  const apps = useShell((state) => state.apps)
  const openApp = useShell((state) => state.openApp)
  const setShellPrompt = useShell((state) => state.setShellPrompt)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [byKeyboard, setByKeyboard] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; appId: string } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(6)

  const shown = useMemo(() => {
    const q = query.trim()
    const all: Entry[] = [...apps.map((app) => ({ kind: 'app' as const, app })), ...uninstalled(apps).map((entry) => ({ kind: 'catalog' as const, entry }))]
    const ranked = all
      .map((item) => ({ item, score: item.kind === 'app' ? scoreApp(q, item.app.name, item.app.description) : scoreApp(q, entryName(item)) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => (q ? b.score - a.score : entryName(a.item).localeCompare(entryName(b.item))))
    // A name nothing answers to is just another app on the shelf.
    if (!q || ranked.some((hit) => hit.score >= GOOD_MATCH)) return ranked.map((hit) => hit.item)
    const name = titleFor(q)
    return [{ kind: 'typed' as const, id: `typed:${name.toLowerCase()}`, name, prompt: q }, ...ranked.map((hit) => hit.item)]
  }, [apps, query])

  const count = Math.max(1, shown.length)

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, count - 1)))
  }, [count])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    setByKeyboard(false)
    setMenu(null)
    const timer = window.setTimeout(() => searchRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [open])

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
    const item = shown[index]
    if (!item) return
    if (item.kind === 'app') openApp(item.app.id)
    else if (item.kind === 'catalog') launch(item.entry.prompt, item.entry.name)
    else launch(item.prompt, item.name)
  }

  function onKeyDown(event: ReactKeyboardEvent) {
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
  const menuEntry = menu && !menuApp ? shown.find((item) => entryId(item) === menu.appId) : undefined
  const menuItems: MenuNode[] = menuApp
    ? [
        { type: 'item', label: 'Open', onSelect: () => openApp(menuApp.id) },
        { type: 'item', label: 'Customize…', onSelect: () => openEditApp(menuApp.id) },
        { type: 'item', label: 'Reinstall', onSelect: () => regenerateApp(menuApp.id) },
        { type: 'item', label: 'Version History…', onSelect: () => setShellPrompt({ kind: 'history', appId: menuApp.id }) },
        { type: 'sep' },
        { type: 'item', label: 'Delete', danger: true, onSelect: () => setShellPrompt({ kind: 'delete', appId: menuApp.id }) },
      ]
    : menuEntry
      ? [{ type: 'item', label: 'Open', onSelect: () => activate(shown.indexOf(menuEntry)) }]
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
        <label className="shell-drawer-search">
          <Icon name="Search" size={15} />
          <input ref={searchRef} value={query} placeholder="Search" aria-label="Search apps" spellCheck={false} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="shell-drawer-grid" ref={gridRef}>
          {shown.map((item, index) => {
            const id = entryId(item)
            return (
              <div
                key={id}
                data-app-id={id}
                className={cx('shell-drawer-app', byKeyboard && active === index && 'is-kbd')}
                onMouseEnter={() => {
                  setByKeyboard(false)
                  setActive(index)
                }}
                onContextMenu={(event) => openMenu(event, id)}
              >
                <button type="button" className="shell-drawer-hit" onClick={() => activate(index)}>
                  {item.kind === 'app' ? (
                    <AppTile id={item.app.id} icon={item.app.icon} tint={item.app.tint} size={60} />
                  ) : item.kind === 'catalog' ? (
                    <AppTile id={item.entry.id} icon={item.entry.icon} tint={item.entry.tint} size={60} />
                  ) : (
                    <AppTile id={item.id} icon="AppWindow" tint="#7a756f" size={60} />
                  )}
                  <span>{entryName(item)}</span>
                </button>
                <button
                  type="button"
                  className="shell-drawer-more"
                  aria-label={`Actions for ${entryName(item)}`}
                  onClick={(event) => openMenu(event, id)}
                >
                  <Icon name="Ellipsis" size={14} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
      {menu && menuItems.length ? <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} /> : null}
    </div>
  )
}
