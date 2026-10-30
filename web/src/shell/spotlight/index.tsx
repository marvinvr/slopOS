import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '../../design/kit'
import { cx } from '../../design/kit/cx'
import { cycleWallpaper, toggleDarkMode } from '../actions'
import { launch, uninstalled, type CatalogApp } from '../catalog'
import { toggleFullscreen } from '../fullscreen'
import { GOOD_MATCH, scoreApp, scoreText } from '../fuzzy'
import { titleFor } from '../generation'
import { AppTile } from '../icons'
import { pushLayer } from '../layers'
import { useShell } from '../store'
import type { AppManifest } from '../types'
import { loadWorld, openPlace, openThing, type WorldEntity, type WorldIndex, type WorldView } from './world'

type Row =
  | { kind: 'group'; id: string; title: string }
  | { kind: 'app'; id: string; title: string; subtitle?: string; good: boolean; app: AppManifest }
  | { kind: 'place'; id: string; title: string; subtitle?: string; good: boolean; appId: string; view: WorldView }
  | { kind: 'thing'; id: string; title: string; subtitle?: string; good: boolean; entity: WorldEntity; owned: boolean }
  | { kind: 'catalog'; id: string; title: string; good: boolean; entry: CatalogApp }
  | { kind: 'action'; id: string; title: string; good: boolean; run: () => void }
  | { kind: 'create'; id: string; title: string; prompt: string }

export function Spotlight() {
  const open = useShell((state) => state.spotlightOpen)
  const close = useShell((state) => state.setSpotlightOpen)
  const apps = useShell((state) => state.apps)
  const openApp = useShell((state) => state.openApp)
  const setDrawerOpen = useShell((state) => state.setDrawerOpen)
  const closeAllWindows = useShell((state) => state.closeAllWindows)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [world, setWorld] = useState<WorldIndex>({ views: [], entities: [] })
  const inputRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(
    () => buildRows(apps, world, query, { setDrawerOpen, closeAllWindows }),
    [apps, world, query, setDrawerOpen, closeAllWindows],
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    let cancel = false
    void loadWorld().then((index) => {
      if (!cancel) setWorld(index)
    })
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => {
      cancel = true
      window.clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    setActive(preferredIndex(rows))
  }, [rows])

  useEffect(() => {
    if (!open) return
    return pushLayer(() => close(false))
  }, [open, close])

  if (!open) return null

  function activate(index: number) {
    const row = rows[index]
    if (!row) return
    if (row.kind === 'group') return
    if (row.kind === 'app') {
      openApp(row.app.id)
      close(false)
      return
    }
    if (row.kind === 'place') {
      openPlace(row.appId, row.view)
      close(false)
      return
    }
    if (row.kind === 'thing') {
      openThing(row.entity)
      close(false)
      return
    }
    if (row.kind === 'action') {
      row.run()
      close(false)
      return
    }
    if (row.kind === 'catalog') {
      launch(row.entry.prompt, row.entry.name)
      close(false)
      return
    }
    launch(row.prompt, row.title)
    close(false)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => stepRow(rows, current, delta))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      activate(active)
    }
  }

  return (
    <div className="shell-backdrop spotlight" onPointerDown={() => close(false)}>
      <div className="shell-spotlight" role="dialog" aria-label="Spotlight" onPointerDown={(event) => event.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="shell-spotlight-input">
          <Icon name="Search" size={18} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Spotlight Search"
            aria-label="Search"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {rows.length ? (
          <div className="shell-spotlight-list" role="listbox">
            {rows.map((row, index) =>
              row.kind === 'group' ? (
                <div key={row.id} className="shell-spot-group" role="presentation">
                  {row.title}
                </div>
              ) : (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  data-app-id={row.kind === 'app' ? row.app.id : row.kind === 'place' ? row.appId : undefined}
                  data-view-id={row.kind === 'place' ? row.view.viewId : undefined}
                  data-entity={row.kind === 'thing' ? row.entity.name : undefined}
                  className={cx('shell-spot-row', index === active && 'is-active')}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => activate(index)}
                >
                  {row.kind === 'app' ? (
                    <AppTile id={row.app.id} icon={row.app.icon} tint={row.app.tint} size={32} />
                  ) : row.kind === 'catalog' ? (
                    <AppTile id={row.entry.id} icon={row.entry.icon} tint={row.entry.tint} size={32} />
                  ) : row.kind === 'create' ? (
                    <AppTile id={row.id} icon="AppWindow" size={32} />
                  ) : (
                    <span className="shell-spot-glyph">
                      <Icon name={glyphFor(row.kind)} size={16} />
                    </span>
                  )}
                  <span className="shell-spot-copy">
                    <strong>{row.title}</strong>
                    {'subtitle' in row && row.subtitle ? <em>{row.subtitle}</em> : null}
                  </span>
                  <span className="shell-spot-hint">{hintFor(row)}</span>
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function glyphFor(kind: Row['kind']): string {
  if (kind === 'place') return 'PanelsTopLeft'
  if (kind === 'thing') return 'FileText'
  return 'Command'
}

function hintFor(row: Row): string {
  if (row.kind === 'action' || row.kind === 'group') return ''
  return 'Open'
}

function kindLabel(kind: string | undefined): string | undefined {
  const word = kind?.trim()
  if (!word || word.toLowerCase() === 'other') return undefined
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function stepRow(rows: Row[], current: number, delta: number): number {
  if (!rows.length) return 0
  let index = current
  for (let n = 0; n < rows.length; n++) {
    index = (index + delta + rows.length) % rows.length
    if (rows[index]?.kind !== 'group') return index
  }
  return current
}

function buildRows(
  apps: AppManifest[],
  world: WorldIndex,
  query: string,
  actions: { setDrawerOpen: (open: boolean) => void; closeAllWindows: () => void },
): Row[] {
  const q = query.trim()
  const names = new Map(apps.map((app) => [app.id, app.name]))
  const ranked = apps
    .map((app) => ({ app, score: scoreApp(q, app.name, app.description) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name))
  const appRows: Row[] = ranked.map((item) => ({
    kind: 'app',
    id: item.app.id,
    title: item.app.name,
    good: !q || item.score >= GOOD_MATCH,
    app: item.app,
  }))
  const catalogRows: Row[] = uninstalled(apps)
    .map((entry) => ({ entry, score: q ? scoreText(q, entry.name) : 1 }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => ({ kind: 'catalog' as const, id: item.entry.id, title: item.entry.name, good: !q || item.score >= GOOD_MATCH, entry: item.entry }))

  // An empty field shows a handful of apps, like recents.
  if (!q) return [...appRows, ...catalogRows].slice(0, 6)

  const placeRows: Row[] = q
    ? world.views
        .map((view) => {
          const appName = names.get(view.appId) || view.appId
          const title = view.title?.trim() || view.intent
          const score = Math.max(scoreText(q, title), scoreText(q, view.intent) * 0.85, scoreText(q, appName) * 0.4)
          return { view, appName, title, score }
        })
        .filter((item) => item.score > 0 && names.has(item.view.appId))
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .map((item) => ({
          kind: 'place' as const,
          id: `${item.view.appId}:${item.view.viewId}`,
          title: item.title,
          subtitle: item.appName,
          good: item.score >= GOOD_MATCH,
          appId: item.view.appId,
          view: item.view,
        }))
    : []

  const thingRows: Row[] = q
    ? world.entities
        .map((entity) => {
          const score = Math.max(scoreText(q, entity.name), scoreText(q, entity.kind || '') * 0.5, scoreText(q, entity.description || '') * 0.45)
          return { entity, score }
        })
        .filter((item) => item.score > 0 && item.entity.name.trim())
        .sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name))
        .map((item) => ({
          kind: 'thing' as const,
          id: `entity:${item.entity.appId || ''}:${item.entity.name}`,
          title: item.entity.name,
          subtitle: kindLabel(item.entity.kind),
          good: item.score >= GOOD_MATCH,
          entity: item.entity,
          owned: Boolean(item.entity.appId && names.has(item.entity.appId)),
        }))
    : []

  const actionDefs = [
    { id: 'dark', title: 'Toggle Dark Mode', run: toggleDarkMode },
    { id: 'apps', title: 'Show All Apps', run: () => actions.setDrawerOpen(true) },
    { id: 'wallpaper', title: 'Change Wallpaper', run: cycleWallpaper },
    { id: 'fullscreen', title: 'Toggle Full Screen', run: () => void toggleFullscreen() },
    { id: 'close', title: 'Close All Windows', run: () => actions.closeAllWindows() },
  ]
  const actionRows: Row[] = q
    ? actionDefs
        .map((action) => ({ action, score: scoreText(q, action.title) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => ({
          kind: 'action' as const,
          id: item.action.id,
          title: item.action.title,
          good: item.score >= GOOD_MATCH,
          run: item.action.run,
        }))
    : []

  const installed = [...appRows, ...catalogRows]
  const matchedWell = [...installed, ...placeRows, ...thingRows, ...actionRows].some((row) => 'good' in row && row.good)
  const exact = installed.some((row) => row.title.toLowerCase() === q.toLowerCase())
  const showCreate = !exact && (q.length >= 3 || !matchedWell)
  const [appsTaken, placesTaken, thingsTaken, actionsTaken] = fill([installed, placeRows, thingRows, actionRows], showCreate ? 7 : 8)
  const title = titleFor(q)
  const create: Row[] = showCreate ? [{ kind: 'create', id: `create:${title}`, title, prompt: q }] : []
  return [
    ...grouped('Applications', [...appsTaken, ...create]),
    ...grouped('Places', placesTaken),
    ...grouped('Documents', thingsTaken),
    ...grouped('Actions', actionsTaken),
  ]
}

function grouped(title: string, rows: Row[]): Row[] {
  if (!rows.length) return []
  return [{ kind: 'group', id: `group:${title}`, title }, ...rows]
}

/** Keep the list to about eight selectable rows, without one group swallowing the rest. */
function fill(sources: Row[][], max: number): Row[][] {
  const soft = [4, 3, 3, 2]
  const out = sources.map(() => [] as Row[])
  let left = max
  sources.forEach((source, index) => {
    const count = Math.min(source.length, soft[index] ?? 2, left)
    out[index] = source.slice(0, count)
    left -= count
  })
  sources.forEach((source, index) => {
    if (left <= 0) return
    const more = Math.min(source.length - out[index].length, left)
    out[index] = source.slice(0, out[index].length + more)
    left -= more
  })
  return out
}

function preferredIndex(rows: Row[]): number {
  const good = rows.findIndex((row) => row.kind !== 'group' && 'good' in row && row.good)
  if (good >= 0) return good
  const create = rows.findIndex((row) => row.kind === 'create')
  if (create >= 0) return create
  const first = rows.findIndex((row) => row.kind !== 'group')
  return first >= 0 ? first : 0
}
