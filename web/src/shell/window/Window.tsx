import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { SLOP_PROTOCOL } from '../../../../runtime/protocol'
import { Button, IconButton } from '../../design/kit'
import { cx } from '../../design/kit/cx'
import { useWindowBridge } from '../bridge/useWindowBridge'
import { dropBuild, regenerateApp, useGeneration } from '../generation'
import { AppTile } from '../icons'
import { MENU_H } from '../metrics'
import { previewAt } from '../snap'
import { clearEntering, isEntering, isPending, useShell, type Win } from '../store'
import { canGoForward, clearScreens, currentScreen, goBack, goForward, reloadScreen, retryScreen, usePending } from './screens'
import { WindowSkeleton } from './Skeleton'

const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const

export function Window({ win }: { win: Win }) {
  const ref = useRef<HTMLElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const dragged = useRef(false)
  const [zooming, setZooming] = useState(false)
  const [opening, setOpening] = useState(() => isEntering(win.id))
  const focused = useShell((state) => state.focusedWindowId === win.id && win.phase !== 'minimized')
  const app = useShell((state) => state.apps.find((item) => item.id === win.appId))
  const focusWindow = useShell((state) => state.focusWindow)
  const closeWindow = useShell((state) => state.closeWindow)
  const removeWindow = useShell((state) => state.removeWindow)
  const minimizeWindow = useShell((state) => state.minimizeWindow)
  const commitMinimized = useShell((state) => state.commitMinimized)
  const commitRestored = useShell((state) => state.commitRestored)
  const toggleMaximize = useShell((state) => state.toggleMaximize)
  const setGeometry = useShell((state) => state.setGeometry)
  const setInteracting = useShell((state) => state.setInteracting)
  const mode = useShell((state) => state.resolved)
  const accent = useShell((state) => state.accent)
  const build = useGeneration().builds.find((item) => item.windowId === win.id)
  const pending = isPending(win.appId)
  // An app from the older format has no HTML screen yet: it reinstalls the moment its window opens.
  const stale = Boolean(app?.stale)
  const building = pending || stale ? !build?.failed : Boolean(build && !build.failed)
  const failed = build?.failed ? build : undefined
  const next = usePending(win.id)
  const top = currentScreen(win)
  useWindowBridge(win, iframeRef)
  const screenId = top?.viewId || 'root'
  // The theme rides along only so the first paint is right; later changes arrive as messages, without a reload.
  const theme = useRef({ mode, accent, screen: '' })
  const screenKey = `${win.appId}:${screenId}:${win.version}`
  if (theme.current.screen !== screenKey) theme.current = { mode, accent, screen: screenKey }
  const src = `/api/apps/${encodeURIComponent(win.appId)}/screens/${encodeURIComponent(screenId)}?v=${encodeURIComponent(String(win.version))}&win=${encodeURIComponent(win.id)}&theme=${theme.current.mode}&accent=${encodeURIComponent(theme.current.accent)}`
  const [bootSrc, setBootSrc] = useState(src)
  const [boot, setBoot] = useState<'in' | 'out' | 'off'>('in')
  // Once a window has shown the placeholder, it stays up until the screen paints, so the swap is one fade.
  const [placeheld, setPlaceheld] = useState(pending)
  if (bootSrc !== src) {
    setBootSrc(src)
    setBoot('in')
    setPlaceheld(true)
  } else if (building && !placeheld) setPlaceheld(true)
  else if (placeheld && !building && boot === 'off') setPlaceheld(false)

  useEffect(() => {
    if (!stale || build) return
    clearScreens(win.id)
    regenerateApp(win.appId)
  }, [stale, build, win.id, win.appId])

  useEffect(() => {
    if (!opening) return
    clearEntering(win.id)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setOpening(false)
  }, [opening, win.id])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current?.contentWindow
      if (!frame || event.source !== frame) return
      const data = event.data as { slop?: unknown; type?: string } | null
      if (!data || data.slop !== SLOP_PROTOCOL || data.type !== 'ready') return
      setBoot((current) => (current === 'in' ? 'out' : current))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (boot !== 'out') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBoot('off')
      return
    }
    const timer = window.setTimeout(() => setBoot('off'), 200)
    return () => window.clearTimeout(timer)
  }, [boot])

  useEffect(() => {
    const leaving = win.phase === 'closing' || win.phase === 'minimizing'
    if (!leaving) return
    const el = ref.current
    const done = () => {
      if (win.phase === 'closing') removeWindow(win.id)
      else commitMinimized(win.id)
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!el || reduce) {
      done()
      return
    }
    const icon = document.querySelector(`[data-dock-app="${CSS.escape(win.appId)}"]`)
    const from = el.getBoundingClientRect()
    let dx = 0
    let dy = 96
    if (icon) {
      const to = icon.getBoundingClientRect()
      dx = to.left + to.width / 2 - (from.left + from.width / 2)
      dy = to.top + to.height / 2 - (from.top + from.height / 2)
    }
    el.style.animation = 'none'
    el.style.transformOrigin = 'center center'
    el.style.transition = 'transform 180ms var(--slop-ease), opacity 160ms ease'
    const frame = window.requestAnimationFrame(() => {
      el.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(0.2)`
      el.style.opacity = '0'
    })
    const timer = window.setTimeout(done, 180)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [win.phase, win.id, win.appId, removeWindow, commitMinimized])

  useLayoutEffect(() => {
    if (win.phase !== 'restoring') return
    setOpening(false)
    const el = ref.current
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!el || reduce) {
      commitRestored(win.id)
      return
    }
    const icon = document.querySelector(`[data-dock-app="${CSS.escape(win.appId)}"]`)
    const from = el.getBoundingClientRect()
    let dx = 0
    let dy = 96
    if (icon) {
      const to = icon.getBoundingClientRect()
      dx = to.left + to.width / 2 - (from.left + from.width / 2)
      dy = to.top + to.height / 2 - (from.top + from.height / 2)
    }
    el.style.animation = 'none'
    el.style.transformOrigin = 'center center'
    el.style.transition = 'none'
    el.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(0.2)`
    el.style.opacity = '0'
    let frame2 = 0
    const frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms var(--slop-ease), opacity 160ms ease'
        el.style.transform = 'none'
        el.style.opacity = '1'
      })
    })
    const timer = window.setTimeout(() => {
      el.style.transition = ''
      el.style.transform = ''
      el.style.opacity = ''
      commitRestored(win.id)
    }, 200)
    return () => {
      window.cancelAnimationFrame(frame1)
      window.cancelAnimationFrame(frame2)
      window.clearTimeout(timer)
      el.style.transition = ''
      el.style.transform = ''
      el.style.opacity = ''
    }
  }, [win.phase, win.id, win.appId, commitRestored])

  const wasFrame = useRef(`${win.maximized}:${win.snap}`)
  useEffect(() => {
    const key = `${win.maximized}:${win.snap}`
    if (wasFrame.current === key) return
    wasFrame.current = key
    if (useShell.getState().interacting) return
    setZooming(true)
    const timer = window.setTimeout(() => setZooming(false), 180)
    return () => window.clearTimeout(timer)
  }, [win.maximized, win.snap])

  if (win.phase === 'minimized') return null

  function onTitleDown(event: ReactPointerEvent) {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.shell-lights')) return
    focusWindow(win.id)
    const pre = { x: win.x, y: win.y, width: win.width, height: win.height }
    const grabRatio = clampGrab((event.clientX - win.x) / Math.max(1, win.width))
    const grabY = event.clientY - win.y
    let startX = event.clientX
    let startY = event.clientY
    let originX = win.x
    let originY = win.y
    let width = win.width
    const anchored = win.maximized || Boolean(win.snap)
    dragged.current = false
    setInteracting(true)
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!dragged.current && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
      const shell = useShell.getState()
      if (!dragged.current && anchored) {
        const restored = win.restore ?? pre
        width = restored.width
        const maxX = window.innerWidth - 80
        const minX = 80 - width
        originX = Math.min(maxX, Math.max(minX, ev.clientX - grabRatio * width))
        originY = Math.max(MENU_H, ev.clientY - grabY)
        shell.floatWindow(win.id, { x: originX, y: originY, width, height: restored.height })
        startX = ev.clientX
        startY = ev.clientY
      }
      dragged.current = true
      const nextDx = ev.clientX - startX
      const nextDy = ev.clientY - startY
      const maxX = window.innerWidth - 80
      const minX = 80 - width
      shell.setGeometry(win.id, {
        x: Math.min(maxX, Math.max(minX, originX + nextDx)),
        y: Math.max(MENU_H, originY + nextDy),
      })
      shell.setSnapPreview(previewAt(ev.clientX, ev.clientY))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const shell = useShell.getState()
      const preview = dragged.current ? shell.snapPreview : null
      shell.setSnapPreview(null)
      shell.setInteracting(false)
      if (dragged.current) shell.endDrag(win.id, preview, pre)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onResize(edge: string, event: ReactPointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    focusWindow(win.id)
    const start = { cx: event.clientX, cy: event.clientY, x: win.x, y: win.y, width: win.width, height: win.height }
    setInteracting(true)
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.cx
      const dy = ev.clientY - start.cy
      let { x, y, width, height } = start
      if (edge.includes('e')) width = start.width + dx
      if (edge.includes('s')) height = start.height + dy
      if (edge.includes('w')) width = start.width - dx
      if (edge.includes('n')) height = start.height - dy
      width = Math.max(win.minWidth, width)
      height = Math.max(win.minHeight, height)
      if (edge.includes('w')) x = start.x + (start.width - width)
      if (edge.includes('n')) y = start.y + (start.height - height)
      y = Math.max(MENU_H, y)
      setGeometry(win.id, { x, y, width, height })
    }
    const up = () => {
      setInteracting(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const appName = app?.name || win.title
  const covered = building || Boolean(failed)
  const showBoot = !covered && boot !== 'off'
  const showBar = !covered && (win.screens.length > 0 || Boolean(next))
  const waiting = Boolean(next && !next.failed)

  return (
    <section
      ref={ref}
      className={cx(
        'shell-window',
        focused && 'is-focused',
        zooming && 'is-zooming',
        opening && win.phase === 'open' && 'is-opening',
        win.phase === 'closing' && 'is-closing',
        win.phase === 'minimizing' && 'is-minimizing',
        win.phase === 'restoring' && 'is-restoring',
      )}
      style={{ left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.z }}
      role="dialog"
      aria-label={win.title}
      data-window-id={win.id}
      data-snap={win.maximized ? 'max' : win.snap || undefined}
      onPointerDown={() => focusWindow(win.id)}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === 'shell-win-in') setOpening(false)
      }}
    >
      <div className="shell-titlebar" onPointerDown={onTitleDown} onDoubleClick={() => { if (!dragged.current) toggleMaximize(win.id) }}>
        <div className="shell-lights">
          <Light kind="close" label="Close" onClick={() => closeWindow(win.id)} />
          <Light kind="min" label="Minimize" onClick={() => minimizeWindow(win.id)} />
          <Light kind="max" label={win.maximized ? 'Zoom out' : 'Zoom'} onClick={() => toggleMaximize(win.id)} />
        </div>
        <div className="shell-title">{win.title}</div>
      </div>
      {showBar ? (
        <header className={cx('shell-screen-bar', waiting && 'is-loading')}>
          <IconButton icon="ChevronLeft" label="Back" disabled={!next && !top} onClick={() => goBack(win.id)} />
          <IconButton icon="ChevronRight" label="Forward" disabled={Boolean(next) || !canGoForward(win)} onClick={() => goForward(win.id)} />
          <div className="shell-screen-title">{next ? next.title : top ? top.title : appName}</div>
          {top?.intent && !next ? <IconButton icon="RotateCw" label="Reload" onClick={() => reloadScreen(win.id)} /> : null}
        </header>
      ) : null}
      <div className="shell-window-body">
        {pending || stale ? null : (
          <iframe
            ref={iframeRef}
            title={win.title}
            src={src}
            data-win={win.id}
            sandbox="allow-scripts allow-forms allow-modals"
            referrerPolicy="no-referrer"
            aria-hidden={covered || showBoot || next ? true : undefined}
          />
        )}
        {building || waiting ? <WindowSkeleton label={next?.title || win.title} /> : null}
        {showBoot ? (
          placeheld ? (
            <WindowSkeleton label={win.title} leaving={boot === 'out'} />
          ) : (
            <div className={cx('shell-window-boot', boot === 'out' && 'is-leaving')} aria-hidden>
              <AppTile id={win.appId} icon={app?.icon || ''} tint={app?.tint} size={46} />
            </div>
          )
        ) : null}
        {!focused ? <div className="shell-window-shield" /> : null}
        {failed ? (
          <div className="shell-window-state" role="alert">
            <div className="shell-window-card">
              {app ? <AppTile id={app.id} icon={app.icon} tint={app.tint} size={52} /> : <AppTile id={win.appId} icon="AppWindow" tint="#7a756f" size={52} />}
              <p className="shell-window-lead">
                {pending ? `“${win.title}” can’t be opened right now.` : `${appName} couldn’t be updated.`}
              </p>
              <div className="shell-window-actions">
                <Button size="sm" variant="ghost" onClick={() => (pending || stale ? closeWindow(win.id) : dropBuild(win.id))}>
                  {pending || stale ? 'Close' : 'Cancel'}
                </Button>
                <Button size="sm" variant="primary" onClick={failed.retry}>
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        ) : next?.failed ? (
          <div className="shell-window-state" role="alert">
            <div className="shell-window-card">
              <p className="shell-window-lead">This page couldn’t be loaded.</p>
              <div className="shell-window-actions">
                <Button size="sm" variant="ghost" onClick={() => goBack(win.id)}>
                  Back
                </Button>
                <Button size="sm" variant="primary" onClick={() => retryScreen(win.id)}>
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {win.resizable && !win.maximized && !win.snap
        ? EDGES.map((edge) => <div key={edge} className={cx('shell-resize', edge)} onPointerDown={(event) => onResize(edge, event)} />)
        : null}
    </section>
  )
}

function clampGrab(value: number): number {
  if (Number.isNaN(value)) return 0.5
  return Math.min(0.92, Math.max(0.08, value))
}

function Light({ kind, label, onClick }: { kind: 'close' | 'min' | 'max'; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`shell-light shell-light-${kind}`} aria-label={label} title={label} onClick={onClick}>
      {kind === 'close' ? (
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
          <path d="M1.5 1.5 L6.5 6.5 M6.5 1.5 L1.5 6.5" stroke="rgba(0,0,0,.65)" strokeWidth="1.3" />
        </svg>
      ) : null}
      {kind === 'min' ? (
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
          <path d="M1.5 4 H6.5" stroke="rgba(0,0,0,.65)" strokeWidth="1.3" />
        </svg>
      ) : null}
      {kind === 'max' ? (
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
          <rect x="1.6" y="1.6" width="4.8" height="4.8" fill="none" stroke="rgba(0,0,0,.65)" strokeWidth="1.2" />
        </svg>
      ) : null}
    </button>
  )
}
