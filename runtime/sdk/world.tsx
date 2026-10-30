import { Component, useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Button, Heading, IconButton } from '../../web/src/design/kit'
import type { PersistedScreen } from '../protocol'
import { ScreenTitle } from './context'
import { frameAppId, frameCapture, onHostMessage, send } from './host'
import { bindGenContext, requestGeneration, setGenAppLabel, setGenScreenLabel, type GenRequest, type GenResult } from './gen-client'
import { ConfirmHost } from './confirm'

export type { GenRequest, GenResult }

type Phase = 'loading' | 'ready' | 'error'

/** A screen after the first one. The first screen is the app bundle itself. */
type Screen = {
  id: string
  title: string
  intent?: string
  context?: unknown
  key?: string
  viewId?: string
  phase: Phase
  rev: number
}

/** What the person just did, read off the DOM. */
type Interaction = { action: 'click' | 'enter' | 'change' | 'submit'; label: string; value?: string }

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
    setState((prev) => ({ status: 'loading', data: prev.data, error: undefined }))
    requestGeneration<T>('gen.request', { ...req, kind: req.kind ?? 'content', fresh: fresh > 0 ? true : req.fresh })
      .then((result) => {
        if (cancel) return
        if (result.kind !== 'content') {
          setState({ status: 'error', error: 'Couldn’t load' })
          return
        }
        setState({ status: 'ready', data: result.data })
      })
      .catch((err: unknown) => {
        if (cancel) return
        const message = err instanceof Error ? err.message : 'Couldn’t load'
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

/**
 * Owns the window's screens. Every interaction on the visible screen is caught here,
 * sent with the screen's context, and answered with the next screen.
 */
export function WorldProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Screen[]>([])
  const [ahead, setAhead] = useState<Screen[]>([])
  const [publish, setPublish] = useState(false)
  const [appName, setAppName] = useState('')
  const stageRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef(stack)
  stackRef.current = stack
  const aheadRef = useRef(ahead)
  aheadRef.current = ahead
  const restored = useRef(false)

  const top = stack[stack.length - 1]
  useEffect(() => {
    setGenScreenLabel(top?.title ?? '')
  }, [top?.title])

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type !== 'screens.restore') return
      const payload = (msg.payload ?? {}) as { screens?: PersistedScreen[]; appName?: string }
      if (payload.appName) {
        setGenAppLabel(payload.appName)
        setAppName(payload.appName)
      }
      if (restored.current) return
      restored.current = true
      const saved = (payload.screens ?? []).filter((screen) => screen && typeof screen.viewId === 'string')
      setStack(saved.filter((screen) => !screen.ahead).map(fromPersisted))
      setAhead(saved.filter((screen) => screen.ahead).map(fromPersisted))
      setPublish(true)
    })
  }, [])

  const persistedKey = stable([
    ...stack.filter((screen) => screen.viewId && screen.phase === 'ready').map((screen) => toPersisted(screen, false)),
    ...ahead.filter((screen) => screen.viewId).map((screen) => toPersisted(screen, true)),
  ])
  useEffect(() => {
    if (!publish) return
    send('screens.state', { stack: JSON.parse(persistedKey) as PersistedScreen[] })
  }, [publish, persistedKey])

  const patch = useCallback((id: string, partial: Partial<Screen>) => {
    setStack((items) => items.map((screen) => (screen.id === id ? { ...screen, ...partial } : screen)))
  }, [])

  const load = useCallback(
    (screen: Screen, fresh: boolean) => {
      if (!screen.intent) return
      requestGeneration('gen.request', { intent: screen.intent, kind: 'view', context: screen.context, key: screen.key, fresh: fresh || undefined })
        .then((result) => {
          if (result.kind !== 'view') throw new Error('Couldn’t load')
          patch(screen.id, { phase: 'ready', viewId: result.viewId, title: result.title || screen.title, rev: Date.now() })
        })
        .catch(() => patch(screen.id, { phase: 'error' }))
    },
    [patch],
  )

  const advance = useCallback(
    (interaction: Interaction) => {
      const current = stackRef.current[stackRef.current.length - 1]
      if (current && current.phase === 'loading') return
      const from = current?.viewId || 'root'
      const intent = describe(interaction)
      const stage = stageRef.current
      const context = {
        from,
        title: current?.title || appName,
        interaction,
        values: stage ? fieldValues(stage) : [],
        shown: stage ? visibleText(stage) : '',
      }
      const screen: Screen = {
        id: uid(),
        title: interaction.label || 'Page',
        intent,
        context,
        key: `${frameAppId}:${from}:${hash(stable([interaction, context.values]))}`,
        phase: 'loading',
        rev: 0,
      }
      restored.current = true
      setPublish(true)
      setAhead([])
      setStack((items) => [...items, screen])
      load(screen, false)
    },
    [appName, load],
  )

  const back = useCallback(() => {
    const items = stackRef.current
    const last = items[items.length - 1]
    if (!last) return
    setStack(items.slice(0, -1))
    if (last.phase === 'ready') setAhead((rest) => [last, ...rest])
  }, [])

  const forward = useCallback(() => {
    const [next, ...rest] = aheadRef.current
    if (!next) return
    setAhead(rest)
    setStack((items) => [...items, next])
  }, [])

  useEffect(() => {
    if (!frameCapture) return
    return captureInteractions(advance)
  }, [advance])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
      const isBack = (event.altKey && event.key === 'ArrowLeft') || (mod && (event.key === '[' || event.code === 'BracketLeft'))
      const isForward = (event.altKey && event.key === 'ArrowRight') || (mod && (event.key === ']' || event.code === 'BracketRight'))
      if (!isBack && !isForward) return
      event.preventDefault()
      event.stopPropagation()
      if (isBack) back()
      else forward()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [back, forward])

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type === 'screens.push') {
        const payload = (msg.payload ?? {}) as { viewId?: string; title?: string; intent?: string }
        if (!payload.viewId) return
        restored.current = true
        setPublish(true)
        setAhead([])
        setStack((items) => {
          const last = items[items.length - 1]
          if (last?.viewId === payload.viewId) return items
          return [...items, { id: uid(), title: payload.title || payload.intent || 'Page', intent: payload.intent, viewId: payload.viewId, phase: 'ready', rev: 0 }]
        })
        return
      }
      if (msg.type === 'generative.open') {
        const payload = (msg.payload ?? {}) as { intent?: string }
        const label = payload.intent?.trim()
        if (label) advance({ action: 'click', label })
      }
    })
  }, [advance])

  const showBar = stack.length > 0 || ahead.length > 0
  return (
    <div className={top?.phase === 'loading' ? 'slop-world is-loading' : 'slop-world'}>
      {showBar ? (
        <header className="slop-screen-bar" data-slop-chrome="">
          <IconButton icon="ChevronLeft" label="Back" disabled={!stack.length} onClick={back} />
          <IconButton icon="ChevronRight" label="Forward" disabled={!ahead.length} onClick={forward} />
          <div className="slop-screen-title">{top ? top.title : appName}</div>
          {top?.intent ? (
            <IconButton
              icon="RotateCw"
              label="Reload"
              disabled={top.phase === 'loading'}
              onClick={() => {
                patch(top.id, { phase: 'loading' })
                load(top, true)
              }}
            />
          ) : null}
        </header>
      ) : null}
      <div className="slop-screen">
        <div className="slop-screen-body" ref={stageRef}>
          <div className="slop-world-base" hidden={Boolean(top)}>
            {children}
          </div>
          {top ? (
            <ScreenTitle key={top.id}>
              {top.phase === 'error' ? (
                <GenError
                  onRetry={() => {
                    patch(top.id, { phase: 'loading' })
                    load(top, true)
                  }}
                />
              ) : top.viewId && top.phase === 'ready' ? (
                <ViewFrame viewId={top.viewId} rev={top.rev} />
              ) : (
                <Materializing title={top.title} />
              )}
            </ScreenTitle>
          ) : null}
        </div>
      </div>
      <ConfirmHost />
    </div>
  )
}

const TARGETS = [
  'button',
  'a',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '.slop-list-item',
  '.slop-card.is-clickable',
  '.slop-chip',
].join(',')

/** Catch clicks, Enter, changes and submits before the screen's own handlers. The screen never wires anything. */
function captureInteractions(onInteraction: (interaction: Interaction) => void): () => void {
  const inScreen = (el: Element) => Boolean(el.closest('.slop-screen-body')) && !el.closest('[data-slop-chrome]')

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target || !inScreen(target)) return
    if (target.closest('input, textarea, select, option, label')) return
    const hit = target.closest(TARGETS)
    if (!hit || hit.closest('[aria-disabled="true"], :disabled')) return
    event.preventDefault()
    event.stopPropagation()
    onInteraction({ action: 'click', label: labelOf(hit) })
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (!target || !inScreen(target)) return
    const isField = target instanceof HTMLInputElement || (target instanceof HTMLTextAreaElement && (event.metaKey || event.ctrlKey))
    if (!isField) return
    event.preventDefault()
    event.stopPropagation()
    const field = target as HTMLInputElement | HTMLTextAreaElement
    onInteraction({ action: 'enter', label: fieldLabel(field), value: field.value.slice(0, 400) })
  }

  const onChange = (event: Event) => {
    const target = event.target
    if (!(target instanceof HTMLSelectElement || target instanceof HTMLInputElement) || !inScreen(target)) return
    if (target instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'color', 'date', 'time'].includes(target.type)) return
    event.stopPropagation()
    const value = target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio') ? (target.checked ? 'on' : 'off') : target.value
    onInteraction({ action: 'change', label: fieldLabel(target), value })
  }

  const onSubmit = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target || !inScreen(target)) return
    event.preventDefault()
    event.stopPropagation()
    onInteraction({ action: 'submit', label: target.getAttribute('aria-label') || 'the form' })
  }

  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKey, true)
  document.addEventListener('change', onChange, true)
  document.addEventListener('submit', onSubmit, true)
  return () => {
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('change', onChange, true)
    document.removeEventListener('submit', onSubmit, true)
  }
}

function labelOf(el: Element): string {
  const own = el.getAttribute('aria-label') || el.getAttribute('title') || (el as HTMLElement).innerText || el.textContent || ''
  const text = clip(own, 80)
  if (text) return text
  const icon = el.querySelector('[data-icon]')?.getAttribute('data-icon')
  return icon || el.tagName.toLowerCase()
}

function fieldLabel(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const byFor = field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`)?.textContent : ''
  const wrapped = field.closest('label')?.textContent
  const fieldBox = field.closest('.slop-field')?.querySelector('.slop-field-label')?.textContent
  const raw = field.getAttribute('aria-label') || byFor || fieldBox || wrapped || ('placeholder' in field ? field.placeholder : '') || field.name || 'a field'
  return clip(raw, 60)
}

function fieldValues(root: HTMLElement): { field: string; value: string }[] {
  const out: { field: string; value: string }[] = []
  root.querySelectorAll('input, textarea, select').forEach((node) => {
    const field = node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    if (field.closest('[hidden]') || (field instanceof HTMLInputElement && field.type === 'password')) return
    const value = field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio') ? (field.checked ? 'on' : '') : field.value
    if (value) out.push({ field: fieldLabel(field), value: value.slice(0, 200) })
  })
  return out.slice(0, 20)
}

function visibleText(root: HTMLElement): string {
  const shown = [...root.children].find((child) => !(child as HTMLElement).hidden) as HTMLElement | undefined
  return clip((shown || root).innerText || '', 2500)
}

function describe(interaction: Interaction): string {
  if (interaction.action === 'enter') return `Typed “${interaction.value}” in ${interaction.label} and pressed Enter`
  if (interaction.action === 'change') return `Set ${interaction.label} to ${interaction.value}`
  if (interaction.action === 'submit') return `Submitted ${interaction.label}`
  return `Clicked “${interaction.label}”`
}

function Materializing({ title }: { title: string }) {
  return (
    <div className="slop-material" role="status" aria-label={`Loading ${title}`}>
      <div className="slop-skeleton" aria-hidden>
        <div className="slop-skeleton-heading" />
        <div className="slop-skeleton-line" />
        <div className="slop-skeleton-line is-mid" />
        <div className="slop-skeleton-line is-short" />
        <div className="slop-skeleton-card">
          <div className="slop-skeleton-row" />
          <div className="slop-skeleton-row" />
          <div className="slop-skeleton-row is-short" />
        </div>
      </div>
    </div>
  )
}

function GenError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  useEffect(() => {
    if (message) console.warn(message)
  }, [message])
  return (
    <div className="slop-gen-error" data-slop-chrome="">
      <Heading level={2}>This page couldn’t be loaded.</Heading>
      {onRetry ? (
        <Button variant="primary" onClick={onRetry}>
          Try Again
        </Button>
      ) : null}
    </div>
  )
}

const viewCache = new Map<string, ComponentType>()

function ViewFrame({ viewId, rev }: { viewId: string; rev: number }) {
  const [Comp, setComp] = useState<ComponentType | null>(() => viewCache.get(viewId) ?? null)
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
      .then((mod: { default?: ComponentType }) => {
        if (cancel) return
        if (typeof mod.default !== 'function') throw new Error('View has no default export')
        viewCache.set(viewId, mod.default)
        setComp(() => mod.default as ComponentType)
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
  if (!Comp) return <Materializing title="Page" />
  return (
    <ViewBoundary key={`${viewId}:${rev}`}>
      <Comp />
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

function fromPersisted(screen: PersistedScreen): Screen {
  return {
    id: screen.id,
    title: screen.title,
    intent: screen.intent,
    context: screen.context,
    key: screen.key,
    viewId: screen.viewId,
    phase: 'ready',
    rev: 0,
  }
}

function toPersisted(screen: Screen, isAhead: boolean): PersistedScreen {
  return {
    id: screen.id,
    title: screen.title,
    viewId: screen.viewId || '',
    intent: screen.intent,
    context: slim(screen.context),
    key: screen.key,
    ...(isAhead ? { ahead: true } : {}),
  }
}

/** Saved screens keep enough context to reload, not the whole page text. */
function slim(context: unknown): unknown {
  if (!context || typeof context !== 'object' || !('shown' in context)) return context
  const shown = (context as { shown?: unknown }).shown
  return { ...context, shown: typeof shown === 'string' ? clip(shown, 1200) : shown }
}

function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trim()}…`
}

function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return h.toString(36)
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
