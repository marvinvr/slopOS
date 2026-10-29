import { useEffect } from 'react'
import { useShell } from '../store'

export function Toasts() {
  const toasts = useShell((state) => state.toasts)
  const dismiss = useShell((state) => state.dismissToast)
  return (
    <div className="shell-toasts" aria-live="polite">
      {toasts.map((toast) => (
        <ToastView key={toast.id} id={toast.id} title={toast.title} body={toast.body} onDone={() => dismiss(toast.id)} />
      ))}
    </div>
  )
}

function ToastView({ id, title, body, onDone }: { id: string; title: string; body?: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 4200)
    return () => window.clearTimeout(timer)
  }, [id, onDone])
  return (
    <div className="shell-toast" role="status">
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
    </div>
  )
}
