import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '../../design/kit'
import { cx } from '../../design/kit/cx'
import { toggleDarkMode } from '../actions'
import { GOOD_MATCH, scoreApp, scoreText } from '../fuzzy'
import { startGeneration, useGrokStatus } from '../generation'
import { AppTile } from '../icons'
import { pushLayer } from '../layers'
import { useShell } from '../store'
import type { AppManifest } from '../types'

type Row =
  | { kind: 'app'; id: string; title: string; subtitle?: string; good: boolean; app: AppManifest }
  | { kind: 'action'; id: string; title: string; good: boolean; run: () => void }
  | { kind: 'create'; title: string; disabled: boolean; reason?: string }

export function Spotlight() {
  const open = useShell((state) => state.spotlightOpen)
  const close = useShell((state) => state.setSpotlightOpen)
  const apps = useShell((state) => state.apps)
  const openApp = useShell((state) => state.openApp)
  const setDrawerOpen = useShell((state) => state.setDrawerOpen)
  const closeAllWindows = useShell((state) => state.closeAllWindows)
  const grok = useGrokStatus()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(
    () => buildRows(apps, query, grok.available, grok.reason, { setDrawerOpen, closeAllWindows }),
    [apps, query, grok.available, grok.reason, setDrawerOpen, closeAllWindows],
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
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
    if (row.kind === 'app') {
      openApp(row.app.id)
      close(false)
      return
    }
    if (row.kind === 'action') {
      row.run()
      close(false)
      return
    }
    if (row.disabled) return
    startGeneration(query.trim())
    close(false)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => {
        if (!rows.length) return 0
        return (current + delta + rows.length) % rows.length
      })
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
            placeholder="Search, or describe an app"
            aria-label="Search"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {rows.length ? (
          <div className="shell-spotlight-list" role="listbox">
            {rows.map((row, index) => (
              <button
                key={row.kind === 'create' ? 'create' : row.id}
                type="button"
                role="option"
                aria-selected={index === active}
                aria-disabled={row.kind === 'create' && row.disabled}
                data-app-id={row.kind === 'app' ? row.app.id : undefined}
                className={cx('shell-spot-row', index === active && 'is-active', row.kind === 'create' && row.disabled && 'is-disabled')}
                onMouseEnter={() => setActive(index)}
                onClick={() => activate(index)}
              >
                {row.kind === 'app' ? (
                  <AppTile id={row.app.id} icon={row.app.icon} tint={row.app.tint} size={32} />
                ) : (
                  <span className={cx('shell-spot-glyph', row.kind === 'create' && 'is-create')}>
                    <Icon name={row.kind === 'create' ? 'Sparkles' : 'Command'} size={16} />
                  </span>
                )}
                <span className="shell-spot-copy">
                  <strong>{row.title}</strong>
                  {row.kind === 'app' && row.subtitle ? <em>{row.subtitle}</em> : null}
                </span>
                <span className="shell-spot-hint">{row.kind === 'app' ? 'Open' : row.kind === 'create' ? (row.disabled ? row.reason : 'with Grok') : ''}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="shell-spot-empty">Describe an app and Grok will write it.</p>
        )}
      </div>
    </div>
  )
}

function buildRows(
  apps: AppManifest[],
  query: string,
  grokOk: boolean,
  reason: string | undefined,
  actions: { setDrawerOpen: (open: boolean) => void; closeAllWindows: () => void },
): Row[] {
  const q = query.trim()
  const ranked = apps
    .map((app) => ({ app, score: scoreApp(q, app.name, app.description) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name))
    .slice(0, 8)
  const appRows: Row[] = ranked.map((item) => ({
    kind: 'app',
    id: item.app.id,
    title: item.app.name,
    subtitle: item.app.description,
    good: !q || item.score >= GOOD_MATCH,
    app: item.app,
  }))

  const actionDefs = [
    { id: 'dark', title: 'Toggle dark mode', run: toggleDarkMode },
    { id: 'apps', title: 'Show all apps', run: () => actions.setDrawerOpen(true) },
    { id: 'close', title: 'Close all windows', run: () => actions.closeAllWindows() },
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

  const matchedWell = appRows.some((row) => row.kind === 'app' && row.good) || actionRows.some((row) => row.kind === 'action' && row.good)
  const showCreate = q.length >= 3 || (q.length > 0 && !matchedWell)
  const create: Row | null = showCreate
    ? { kind: 'create', title: `Create “${q}”`, disabled: !grokOk, reason: reason || 'Grok isn’t available' }
    : null

  return create ? [...appRows, ...actionRows, create] : [...appRows, ...actionRows]
}

function preferredIndex(rows: Row[]): number {
  const goodApp = rows.findIndex((row) => row.kind === 'app' && row.good)
  if (goodApp >= 0) return goodApp
  const goodAction = rows.findIndex((row) => row.kind === 'action' && row.good)
  if (goodAction >= 0) return goodAction
  const create = rows.findIndex((row) => row.kind === 'create')
  if (create >= 0) return create
  return 0
}
