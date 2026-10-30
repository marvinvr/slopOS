import { useEffect, useRef, useState } from 'react'
import { AppTile, Mark } from '../icons'
import { useShell } from '../store'

const LIFE = 4600

export function Toasts() {
  const toasts = useShell((state) => state.toasts)
  const dismiss = useShell((state) => state.dismissToast)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const apply = () => {
      document.documentElement.style.setProperty('--slop-toast-stack', `${Math.ceil(el.getBoundingClientRect().height)}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--slop-toast-stack')
    }
  }, [])

  return (
    <div className="shell-toasts" ref={box} aria-live="polite">
      {toasts.map((toast) => (
        <ToastView key={toast.id} id={toast.id} title={toast.title} body={toast.body} appId={toast.appId} onDone={() => dismiss(toast.id)} />
      ))}
    </div>
  )
}

function ToastView({ id, title, body, appId, onDone }: { id: string; title: string; body?: string; appId?: string; onDone: () => void }) {
  const app = useShell((state) => (appId ? state.apps.find((item) => item.id === appId) : undefined))
  const [paused, setPaused] = useState(false)
  const remaining = useRef(LIFE)
  const started = useRef(Date.now())
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (paused) {
      remaining.current = Math.max(0, remaining.current - (Date.now() - started.current))
      return
    }
    started.current = Date.now()
    const timer = window.setTimeout(() => doneRef.current(), remaining.current)
    return () => window.clearTimeout(timer)
  }, [paused, id])

  return (
    <div className="shell-toast" role="status" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onClick={onDone}>
      <span className="shell-toast-icon">
        {app ? <AppTile id={app.id} icon={app.icon} tint={app.tint} size={28} /> : <Mark size={18} />}
      </span>
      <span className="shell-toast-copy">
        <strong>{title}</strong>
        {body ? <p>{body}</p> : null}
      </span>
    </div>
  )
}
