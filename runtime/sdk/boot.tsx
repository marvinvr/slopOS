import { Component, useEffect, useState, type ComponentType, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Spinner } from '../../web/src/design/kit'
import { frameAppId, frameVersion, isForwardedShortcut, reportError, send, shortcutPayload } from './host'
import { SlopProvider } from './context'
import { WorldProvider } from './world'
import './frame-imports'

type CrashProps = { message: string; stack?: string }

function Crash({ message, stack }: CrashProps) {
  return (
    <div className="slop-frame-error">
      <h1>This app ran into a problem</h1>
      <p>{message}</p>
      {stack ? (
        <details>
          <summary>Details</summary>
          <pre>{stack}</pre>
        </details>
      ) : null}
    </div>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error.message, error.stack || info.componentStack || undefined)
  }

  render(): ReactNode {
    if (this.state.error) return <Crash message={this.state.error.message} stack={this.state.error.stack} />
    return this.props.children
  }
}

function FrameApp() {
  const [App, setApp] = useState<ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    const url = `/api/apps/${encodeURIComponent(frameAppId)}/bundle.js?v=${encodeURIComponent(frameVersion)}`
    import(/* @vite-ignore */ url)
      .then((mod: { default?: ComponentType }) => {
        if (cancel) return
        if (typeof mod.default !== 'function') throw new Error('App has no default export component')
        setApp(() => mod.default as ComponentType)
        send('ready', {})
      })
      .catch((err: unknown) => {
        if (cancel) return
        const message = err instanceof Error ? err.message : String(err)
        const stack = err instanceof Error ? err.stack : undefined
        reportError(message, stack)
        setError(message)
      })
    return () => {
      cancel = true
    }
  }, [])

  if (error) return <Crash message={error} />
  if (!App) {
    return (
      <div className="slop-frame-loading">
        <Spinner />
      </div>
    )
  }
  return (
    <ErrorBoundary>
      <div className="slop-app-root">
        <App />
      </div>
    </ErrorBoundary>
  )
}

function installHostBridges(): void {
  window.addEventListener(
    'keydown',
    (event) => {
      if (!isForwardedShortcut(event)) return
      event.preventDefault()
      event.stopPropagation()
      send('keydown', shortcutPayload(event))
    },
    true,
  )
  // Escape stays in the app if something there handled it (preventDefault).
  // Otherwise the shell gets it, after every listener on this turn has run.
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const payload = shortcutPayload(event)
    queueMicrotask(() => {
      if (event.defaultPrevented) return
      send('keydown', payload)
    })
  })
  window.addEventListener('error', (event) => {
    reportError(event.message || 'Script error', event.error instanceof Error ? event.error.stack : undefined)
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    reportError(message, stack)
  })
}

let booted = false

/** Mount the sandboxed app. Called by runtime/bootstrap.ts — not part of the app-facing API. */
export function bootFrame(rootEl: HTMLElement): void {
  if (booted) return
  booted = true
  installHostBridges()
  const root = createRoot(rootEl)
  if (!frameAppId) {
    root.render(<Crash message="This frame has no app to load." />)
    return
  }
  root.render(
    <SlopProvider>
      <WorldProvider>
        <FrameApp />
      </WorldProvider>
    </SlopProvider>,
  )
}
