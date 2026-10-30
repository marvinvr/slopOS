import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '../../design/kit'
import { cx } from '../../design/kit/cx'
import { useWindowBridge } from '../bridge/useWindowBridge'
import { fixApp, providerLabel, useGrokStatus } from '../generation'
import { MENU_H } from '../metrics'
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
  const toggleMaximize = useShell((state) => state.toggleMaximize)
  const setGeometry = useShell((state) => state.setGeometry)
  const setInteracting = useShell((state) => state.setInteracting)
  const clearError = useShell((state) => state.setWindowError)
  const generator = useGrokStatus()
  useWindowBridge(win, iframeRef)

  useEffect(() => {
    if (!opening) return
    clearEntering(win.id)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setOpening(false)
  }, [opening, win.id])

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

  const wasMax = useRef(win.maximized)
  useEffect(() => {
    if (wasMax.current === win.maximized) return
    wasMax.current = win.maximized
    setZooming(true)
    const timer = window.setTimeout(() => setZooming(false), 180)
    return () => window.clearTimeout(timer)
  }, [win.maximized])

  if (win.phase === 'minimized') return null

  function onTitleDown(event: ReactPointerEvent) {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.shell-lights')) return
    focusWindow(win.id)
    if (win.maximized) return
    const startX = event.clientX
    const startY = event.clientY
    const origX = win.x
    const origY = win.y
    dragged.current = false
    setInteracting(true)
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!dragged.current && Math.abs(dx) < 3 && Math.abs(dy) < 3) return
      dragged.current = true
      const maxX = window.innerWidth - 80
      const minX = 80 - win.width
      setGeometry(win.id, {
        x: Math.min(maxX, Math.max(minX, origX + dx)),
        y: Math.max(MENU_H, origY + dy),
      })
    }
    const up = () => {
      setInteracting(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
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

  const src = `/runtime/frame.html?app=${encodeURIComponent(win.appId)}&v=${encodeURIComponent(String(win.version))}&win=${encodeURIComponent(win.id)}`

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
      )}
      style={{ left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.z }}
      role="dialog"
      aria-label={win.title}
      data-window-id={win.id}
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
        />
        {!focused ? <div className="shell-window-shield" /> : null}
        {error ? (
          <div className="shell-window-error">
            <p>{error.message}</p>
            {!app?.fixture ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  fixApp(win.appId, error.stack ? `${error.message}\n${error.stack}` : error.message)
                }}
              >
                Fix with {providerLabel(generator.provider) || 'the generator'}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => clearError(win.id, null)}>
              Dismiss
            </Button>
          </div>
        ) : null}
      </div>
      {win.resizable && !win.maximized
        ? EDGES.map((edge) => <div key={edge} className={cx('shell-resize', edge)} onPointerDown={(event) => onResize(edge, event)} />)
        : null}
    </section>
  )
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
