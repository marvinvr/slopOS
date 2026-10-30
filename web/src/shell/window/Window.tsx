import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { SLOP_PROTOCOL } from '../../../../runtime/protocol'
import { Button } from '../../design/kit'
import { cx } from '../../design/kit/cx'
import { useWindowBridge } from '../bridge/useWindowBridge'
import { beginWindowFix, fixApp, providerLabel, useGeneration } from '../generation'
import { AppTile } from '../icons'
import { MENU_H } from '../metrics'
import { previewAt } from '../snap'
import { clearEntering, isEntering, useShell, type Win } from '../store'

const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const

export function Window({ win }: { win: Win }) {
  const ref = useRef<HTMLElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const dragged = useRef(false)
  const [zooming, setZooming] = useState(false)
  const [opening, setOpening] = useState(() => isEntering(win.id))
  const focused = useShell((state) => state.focusedWindowId === win.id && win.phase !== 'minimized')
  const app = useShell((state) => state.apps.find((item) => item.id === win.appId))
  const error = useShell((state) => state.windowErrors[win.id])
  const focusWindow = useShell((state) => state.focusWindow)
  const closeWindow = useShell((state) => state.closeWindow)
  const removeWindow = useShell((state) => state.removeWindow)
  const minimizeWindow = useShell((state) => state.minimizeWindow)
  const commitMinimized = useShell((state) => state.commitMinimized)
  const commitRestored = useShell((state) => state.commitRestored)
  const toggleMaximize = useShell((state) => state.toggleMaximize)
  const setGeometry = useShell((state) => state.setGeometry)
  const setInteracting = useShell((state) => state.setInteracting)
  const clearError = useShell((state) => state.setWindowError)
  const generation = useGeneration()
  const generator = generation.status
  const fixing = generation.fixing?.windowId === win.id ? generation.fixing : null
  useWindowBridge(win, iframeRef)
  const src = `/runtime/frame.html?app=${encodeURIComponent(win.appId)}&v=${encodeURIComponent(String(win.version))}&win=${encodeURIComponent(win.id)}`
  const [bootSrc, setBootSrc] = useState(src)
  const [boot, setBoot] = useState<'in' | 'out' | 'off'>('in')
  if (bootSrc !== src) {
    setBootSrc(src)
    setBoot('in')
  } else if ((error || fixing) && boot !== 'off') {
    setBoot('off')
  }

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

  const provider = providerLabel(generator.provider) || 'the generator'
  const appName = app?.name || win.title
  const showBoot = boot !== 'off' && !fixing && !error

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
      <div className="shell-window-body">
        <iframe
          ref={iframeRef}
          title={win.title}
          src={src}
          data-win={win.id}
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          referrerPolicy="no-referrer"
          aria-hidden={fixing || error || showBoot ? true : undefined}
        />
        {showBoot ? (
          <div className={cx('shell-window-boot', boot === 'out' && 'is-leaving')} aria-hidden>
            <AppTile id={win.appId} icon={app?.icon || ''} tint={app?.tint} size={46} />
          </div>
        ) : null}
        {!focused ? <div className="shell-window-shield" /> : null}
        {fixing ? (
          <div className="shell-window-state" role="status" aria-live="polite">
            <div className="shell-window-card">
              <p className="shell-window-lead">slopOS hit a snag in {fixing.appName} — {provider} is fixing it</p>
              <p className="shell-window-status">
                <span className="shell-window-status-dot" aria-hidden />
                <span>{fixing.status}</span>
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="shell-window-state" role="alert">
            <div className="shell-window-card">
              <p className="shell-window-lead">{error.message}</p>
              {error.stack ? (
                <details className="shell-window-stack">
                  <summary>Stack</summary>
                  <pre>{error.stack}</pre>
                </details>
              ) : null}
              <div className="shell-window-actions">
                {!app?.fixture ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      beginWindowFix(win.id, win.appId, appName)
                      fixApp(win.appId, error.stack ? `${error.message}\n${error.stack}` : error.message)
                    }}
                  >
                    Fix with {provider}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => clearError(win.id, null)}>
                  Dismiss
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
