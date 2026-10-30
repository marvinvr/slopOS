import { Component, createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Button, GenerativeProvider, Heading, IconButton, Menu, Text } from '../../web/src/design/kit'
import type { PersistedScreen } from '../protocol'
import { ScreenTitle } from './context'
import { frameAppId, onHostMessage, send } from './host'
import { bindGenContext, friendlyProgress, requestGeneration, setGenAppLabel, setGenScreenLabel, type GenRequest, type GenResult } from './gen-client'
import { ConfirmHost } from './confirm'

export type { GenRequest, GenResult }

type Phase = 'loading' | 'ready' | 'error'

type Screen = {
  id: string
  title: string
  intent?: string
  context?: unknown
  params?: unknown
  viewId?: string
  phase: Phase
  progress?: string
  error?: string
  rev: number
}

type PublicScreen = { id: string; title: string; viewId?: string; intent?: string }

type ScreenApi = {
  push: (target: string | { intent: string; context?: unknown; title?: string }) => void
  pop: () => void
  stack: PublicScreen[]
  open: (intent: string, context?: unknown) => void
  busy: string | null
}

const ScreenContext = createContext<ScreenApi | null>(null)

let opener: (intent: string, context?: unknown) => void = () => {}

export function openGenerative(req: { intent: string; context?: unknown }): void {
  opener(req.intent, req.context)
}

export function useScreens(): { push: ScreenApi['push']; pop: () => void; stack: PublicScreen[] } {
  const api = useContext(ScreenContext)
  if (!api) throw new Error('useScreens must be used inside an app')
  return { push: api.push, pop: api.pop, stack: api.stack }
}

export function useGenContext(ctx: object): void {
  const json = JSON.stringify(ctx)
  useEffect(() => {
    const parsed = JSON.parse(json) as Record<string, unknown>
    return bindGenContext(parsed)
  }, [json])
}

export function generate<T = unknown>(req: GenRequest): Promise<GenResult<T>> {
  return requestGeneration<T>('gen.request', req)
}

type Generated<T> = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data?: T
  error?: string
  progress?: string
  regenerate: () => void
}

export function useGenerated<T = unknown>(req: GenRequest | null): Generated<T> {
  const [fresh, setFresh] = useState(0)
  const [state, setState] = useState<Omit<Generated<T>, 'regenerate'>>({ status: 'idle' })
  const key = req ? stable({ intent: req.intent, kind: req.kind ?? 'content', context: req.context, schema: req.schema, key: req.key }) : ''

  useEffect(() => {
    if (!req) {
      setState({ status: 'idle' })
      return
    }
    let cancel = false
    setState((prev) => ({ status: 'loading', data: prev.data, progress: undefined, error: undefined }))
    requestGeneration<T>(
      'gen.request',
      { ...req, kind: req.kind ?? 'content', fresh: fresh > 0 ? true : req.fresh },
      (text) => {
        if (!cancel) setState((prev) => ({ ...prev, progress: text }))
      },
    )
      .then((result) => {
        if (cancel) return
        if (result.kind !== 'content') {
          setState({ status: 'error', error: 'Expected generated content' })
          return
        }
        setState({ status: 'ready', data: result.data })
      })
      .catch((err: unknown) => {
        if (cancel) return
        const message = err instanceof Error ? err.message : 'Generation failed'
        setState((prev) => ({ status: 'error', error: message, data: prev.data }))
      })
    return () => {
      cancel = true
    }
    // `key` is the request identity. `fresh` forces a new fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fresh])

  return { ...state, regenerate: () => setFresh((n) => n + 1) }
}

export function GenerativeView({ intent, context, fallback }: { intent: string; context?: unknown; fallback?: ReactNode }) {
  const [nonce, setNonce] = useState(0)
  const [phase, setPhase] = useState<Phase>('loading')
  const [viewId, setViewId] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const ctxKey = stable(context)

  useEffect(() => {
    let cancel = false
    setPhase('loading')
    setProgress(undefined)
    setError(undefined)
    requestGeneration('gen.request', { intent, kind: 'view', context, fresh: nonce > 0 || undefined }, (text) => {
      if (!cancel) setProgress(text)
    })
      .then((result) => {
        if (cancel) return
        if (result.kind !== 'view') throw new Error('Expected a view')
        setViewId(result.viewId)
        setPhase('ready')
      })
      .catch((err: unknown) => {
        if (cancel) return
        setPhase('error')
        setError(err instanceof Error ? err.message : 'Generation failed')
      })
    return () => {
      cancel = true
    }
  }, [intent, ctxKey, nonce, context])

  if (phase === 'error') return <GenError message={error} onRetry={() => setNonce((n) => n + 1)} />
  if (phase !== 'ready' || !viewId) return fallback ?? <Materializing title={intent} status={progress} />
  return <ViewFrame viewId={viewId} rev={nonce} params={{ title: intent, intent }} context={context} />
}

export function WorldProvider({ children }: { children: ReactNode }) {
  const [screens, setScreens] = useState<Screen[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [publish, setPublish] = useState(false)
  const screensRef = useRef(screens)
  screensRef.current = screens
  const busyRef = useRef<string | null>(null)
  const restoreRef = useRef(true)

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type !== 'screens.restore') return
      const payload = (msg.payload ?? {}) as { screens?: PersistedScreen[]; appName?: string }
      if (payload.appName) setGenAppLabel(payload.appName)
      if (!restoreRef.current) return
      restoreRef.current = false
      setScreens((payload.screens ?? []).filter((screen) => screen && typeof screen.viewId === 'string').map(fromPersisted))
      setPublish(true)
    })
  }, [])

  const top = screens[screens.length - 1]
  useEffect(() => {
    setGenScreenLabel(top?.title ?? '')
  }, [top?.title])

  const persisted = screens.filter((screen) => screen.viewId && screen.phase !== 'error').map(toPersisted)
  const persistedKey = stable(persisted)
  useEffect(() => {
    if (!publish || !persistedKey) return
    send('screens.state', { stack: JSON.parse(persistedKey) as PersistedScreen[] })
  }, [publish, persistedKey])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (screensRef.current.length === 0) return
      const altBack = event.altKey && !event.metaKey && !event.ctrlKey && event.key === 'ArrowLeft'
      const modBack = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && (event.key === '[' || event.code === 'BracketLeft')
      if (!altBack && !modBack) return
      event.preventDefault()
      event.stopPropagation()
      setScreens((stack) => stack.slice(0, -1))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const api = useMemo<ScreenApi>(() => {
    function patch(id: string, partial: Partial<Screen>) {
      setScreens((stack) => stack.map((screen) => (screen.id === id ? { ...screen, ...partial } : screen)))
    }

    function runView(id: string, intent: string, context: unknown, fresh: boolean) {
      requestGeneration(
        'gen.request',
        { intent, kind: 'view', context, fresh },
        (text) => patch(id, { progress: text }),
      )
        .then((result) => {
          if (result.kind !== 'view') {
            patch(id, { phase: 'error', error: 'Expected a view', progress: undefined })
            return
          }
          patch(id, { phase: 'ready', viewId: result.viewId, error: undefined, progress: undefined, rev: Date.now() })
        })
        .catch((err: unknown) => {
          patch(id, { phase: 'error', error: err instanceof Error ? err.message : 'Generation failed', progress: undefined })
        })
    }

    function open(intent: string, context?: unknown) {
      const label = intent.trim()
      if (!label || busyRef.current) return
      busyRef.current = label
      setBusy(label)
      restoreRef.current = false
      const id = uid()
      setScreens((stack) => [...stack, pending(id, label, context)])
      setPublish(true)
      requestGeneration('gen.open', { intent: label, kind: 'auto', context }, (text) => patch(id, { progress: text }))
        .then((result) => {
          if (result.kind === 'view') {
            patch(id, { phase: 'ready', viewId: result.viewId, progress: undefined, rev: Date.now() })
            return
          }
          setScreens((stack) => stack.filter((screen) => screen.id !== id))
        })
        .catch((err: unknown) => {
          patch(id, { phase: 'error', error: err instanceof Error ? err.message : 'Generation failed', progress: undefined })
        })
        .finally(() => {
          if (busyRef.current === label) {
            busyRef.current = null
            setBusy(null)
          }
        })
    }

    return {
      busy,
      open,
      pop: () => setScreens((stack) => stack.slice(0, -1)),
      push: (target) => {
        restoreRef.current = false
        setPublish(true)
        if (typeof target === 'string') {
          setScreens((stack) => [
            ...stack,
            { id: uid(), title: 'Page', viewId: target, phase: 'ready', rev: 0 },
          ])
          return
        }
        const id = uid()
        const title = target.title?.trim() || target.intent
        setScreens((stack) => [...stack, { ...pending(id, title, target.context), intent: target.intent }])
        runView(id, target.intent, target.context, false)
      },
      stack: screens.map((screen) => ({ id: screen.id, title: screen.title, viewId: screen.viewId, intent: screen.intent })),
    }
  }, [busy, screens])

  const apiRef = useRef(api)
  apiRef.current = api
  useEffect(() => {
    opener = (intent, context) => apiRef.current.open(intent, context)
    return () => {
      opener = () => {}
    }
  }, [])

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type === 'screens.push') {
        const payload = (msg.payload ?? {}) as { viewId?: string; title?: string; intent?: string }
        if (!payload.viewId) return
        restoreRef.current = false
        setPublish(true)
        setScreens((stack) => {
          const top = stack[stack.length - 1]
          if (top?.viewId === payload.viewId && top.phase === 'ready') return stack
          return [
            ...stack,
            {
              id: uid(),
              title: payload.title || payload.intent || 'Page',
              intent: payload.intent,
              viewId: payload.viewId,
              phase: 'ready',
              rev: 0,
              params: { title: payload.title || payload.intent, intent: payload.intent },
            },
          ]
        })
        return
      }
      if (msg.type === 'generative.open') {
        const payload = (msg.payload ?? {}) as { intent?: string; context?: unknown }
        const intent = payload.intent?.trim()
        if (!intent) return
        apiRef.current.open(intent, payload.context)
      }
    })
  }, [])

  function retry(screen: Screen) {
    if (!screen.intent) return
    setScreens((stack) => stack.map((item) => (item.id === screen.id ? { ...item, phase: 'loading', error: undefined, progress: undefined, viewId: undefined } : item)))
    requestGeneration('gen.request', { intent: screen.intent, kind: 'view', context: screen.context, fresh: true }, (text) => {
      setScreens((stack) => stack.map((item) => (item.id === screen.id ? { ...item, progress: text } : item)))
    })
      .then((result) => {
        if (result.kind !== 'view') throw new Error('Expected a view')
        setScreens((stack) =>
          stack.map((item) => (item.id === screen.id ? { ...item, phase: 'ready', viewId: result.viewId, progress: undefined, rev: Date.now() } : item)),
        )
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Generation failed'
        setScreens((stack) => stack.map((item) => (item.id === screen.id ? { ...item, phase: 'error', error: message, progress: undefined } : item)))
      })
  }

  function regenerate(screen: Screen) {
    if (!screen.intent) return
    setScreens((stack) => stack.map((item) => (item.id === screen.id ? { ...item, phase: 'loading', progress: 'Redrawing…', error: undefined } : item)))
    requestGeneration('gen.request', { intent: screen.intent, kind: 'view', context: screen.context, fresh: true }, (text) => {
      setScreens((stack) => stack.map((item) => (item.id === screen.id ? { ...item, progress: text } : item)))
    })
      .then((result) => {
        if (result.kind !== 'view') throw new Error('Expected a view')
        setScreens((stack) =>
          stack.map((item) =>
            item.id === screen.id ? { ...item, phase: 'ready', viewId: result.viewId, progress: undefined, rev: Date.now() } : item,
          ),
        )
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Generation failed'
        setScreens((stack) => stack.map((item) => (item.id === screen.id ? { ...item, phase: 'error', error: message } : item)))
      })
  }

  return (
    <ScreenContext.Provider value={api}>
      <GenerativeProvider api={{ open: (intent) => api.open(intent), busy }}>
        <div className="slop-world">
          <div className="slop-world-base" hidden={screens.length > 0}>
            {children}
          </div>
          {top ? (
            <ScreenTitle key={top.id}>
              <ScreenStage
                screen={top}
                onPop={() => setScreens((stack) => stack.slice(0, -1))}
                onRetry={() => retry(top)}
                onRegenerate={() => regenerate(top)}
              />
            </ScreenTitle>
          ) : null}
          <ConfirmHost />
        </div>
      </GenerativeProvider>
    </ScreenContext.Provider>
  )
}

function ScreenStage({
  screen,
  onPop,
  onRetry,
  onRegenerate,
}: {
  screen: Screen
  onPop: () => void
  onRetry: () => void
  onRegenerate: () => void
}) {
  const refreshing = screen.phase === 'loading' && Boolean(screen.viewId)
  return (
    <div className={screen.phase === 'loading' ? 'slop-screen is-loading' : 'slop-screen'}>
      <header className="slop-screen-bar">
        <IconButton icon="ChevronLeft" label="Back" onClick={onPop} />
        <div className="slop-screen-title">{screen.title}</div>
        <Menu
          align="end"
          trigger={<IconButton icon="MoreHorizontal" label="Screen options" />}
          items={[{ label: 'Regenerate', disabled: !screen.intent, onSelect: onRegenerate }]}
        />
      </header>
      <div className="slop-screen-body">
        {screen.phase === 'error' ? (
          <GenError message={screen.error} onRetry={screen.intent ? onRetry : undefined} />
        ) : screen.viewId ? (
          <ViewFrame
            viewId={screen.viewId}
            rev={screen.rev}
            params={screen.params ?? { title: screen.title, intent: screen.intent }}
            context={screen.context}
          />
        ) : (
          <Materializing title={screen.title} status={screen.progress} showTitle={false} />
        )}
        {refreshing ? <div className="slop-screen-note">{screen.progress || 'Redrawing…'}</div> : null}
      </div>
    </div>
  )
}

function Materializing({ title, status, showTitle = true }: { title: string; status?: string; showTitle?: boolean }) {
  return (
    <div className="slop-material" role="status" aria-live="polite">
      {showTitle ? <h2 className="slop-material-title">{title}</h2> : <span className="slop-sr">{title}</span>}
      <div className="slop-skeleton" aria-hidden>
        {showTitle ? null : <div className="slop-skeleton-heading" />}
        <div className="slop-skeleton-line" />
        <div className="slop-skeleton-line is-mid" />
        <div className="slop-skeleton-line is-short" />
        <div className="slop-skeleton-card">
          <div className="slop-skeleton-row" />
          <div className="slop-skeleton-row" />
          <div className="slop-skeleton-row is-short" />
        </div>
      </div>
      <p className="slop-material-status">
        <span className="slop-material-dot" aria-hidden />
        <span>{calmLine(status)}</span>
      </p>
    </div>
  )
}

function calmLine(status?: string): string {
  return friendlyProgress(status || '') ?? 'Sketching…'
}

function GenError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="slop-gen-error">
      <Heading level={2}>This didn’t come through</Heading>
      <Text muted>{message || 'Something got in the way.'}</Text>
      {onRetry ? (
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

type ViewProps = { params: unknown; context: unknown }

const viewCache = new Map<string, ComponentType<ViewProps>>()

function ViewFrame({ viewId, rev, params, context }: { viewId: string; rev: number; params: unknown; context: unknown }) {
  const [Comp, setComp] = useState<ComponentType<ViewProps> | null>(() => viewCache.get(viewId) ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cached = viewCache.get(viewId)
    if (cached) {
      setComp(() => cached)
      setError(null)
      return
    }
    let cancel = false
    setComp(null)
    setError(null)
    const url = `/api/apps/${encodeURIComponent(frameAppId)}/views/${encodeURIComponent(viewId)}/bundle.js`
    import(/* @vite-ignore */ url)
      .then((mod: { default?: ComponentType<ViewProps> }) => {
        if (cancel) return
        if (typeof mod.default !== 'function') throw new Error('View has no default export')
        viewCache.set(viewId, mod.default)
        setComp(() => mod.default as ComponentType<ViewProps>)
      })
      .catch((err: unknown) => {
        if (cancel) return
        setError(err instanceof Error ? err.message : 'Could not load this view')
      })
    return () => {
      cancel = true
    }
  }, [viewId, rev])

  if (error) return <GenError message={error} />
  if (!Comp) return <Materializing title="Page" showTitle={false} status="Opening…" />
  return (
    <ViewBoundary key={`${viewId}:${rev}`}>
      <Comp params={params} context={context} />
    </ViewBoundary>
  )
}

class ViewBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null }
  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.message }
  }
  render(): ReactNode {
    if (this.state.error) return <GenError message={this.state.error} />
    return this.props.children
  }
}

function pending(id: string, title: string, context: unknown): Screen {
  return { id, title, intent: title, context, phase: 'loading', rev: 0, params: { title, intent: title } }
}

function fromPersisted(screen: PersistedScreen): Screen {
  return {
    id: screen.id,
    title: screen.title,
    intent: screen.intent,
    context: screen.context,
    params: screen.params ?? { title: screen.title, intent: screen.intent },
    viewId: screen.viewId,
    phase: 'ready',
    rev: 0,
  }
}

function toPersisted(screen: Screen): PersistedScreen {
  return {
    id: screen.id,
    title: screen.title,
    viewId: screen.viewId || '',
    intent: screen.intent,
    params: screen.params,
    context: screen.context,
  }
}

function uid(): string {
  return crypto.randomUUID()
}

function stable(value: unknown): string {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return ''
  }
}
