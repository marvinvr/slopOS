import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Heading, Spinner, Stack, Text } from '../../design/kit'
import { AppTile } from '../icons'
import { useShell } from '../store'
import { streamJobEvents, type JobEvent } from './api'
import { cancelPanel, closePanel, openGenerated, providerLabel, useGeneration, type PanelJob } from './state'

export function GenerationPanel({ panel }: { panel: PanelJob }) {
  const status = useGeneration().status
  const apps = useShell((state) => state.apps)
  const windows = useShell((state) => state.windows)
  const [events, setEvents] = useState<JobEvent[]>([])
  const [started] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [frozen, setFrozen] = useState<number | null>(null)
  const [hover, setHover] = useState(false)
  const [openState, setOpenState] = useState<'idle' | 'opening' | 'settled'>('idle')
  const label = providerLabel(status.provider) || 'the generator'

  const done = events.find((event) => event.type === 'done')
  const error = [...events].reverse().find((event) => event.type === 'error')
  const thinking = [...events].reverse().find((event) => event.type === 'thinking')
  const result = done && done.type === 'done' ? done.result : undefined
  const failed = Boolean(error) && !done
  const ready = Boolean(done) && !failed
  const finished = ready || failed
  const appResult = result && result.kind === 'app' ? result : undefined
  const app = appResult ? apps.find((item) => item.id === appResult.appId) : undefined
  const name = appResult ? appResult.name || app?.name || 'App' : ''
  const windowOpen = appResult ? windows.some((win) => win.appId === appResult.appId && win.phase !== 'closing') : false
  const showOpen = Boolean(appResult) && openState === 'settled' && !windowOpen
  const canDismiss = ready && (!appResult || (openState === 'settled' && windowOpen))

  useEffect(() => {
    if (finished) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [finished])

  useEffect(() => {
    if (!finished || frozen !== null) return
    setFrozen(now)
  }, [finished, frozen, now])

  useEffect(() => {
    const abort = new AbortController()
    setEvents([])
    streamJobEvents(panel.jobId, (event) => setEvents((prev) => [...prev, event]), abort.signal).catch(() => undefined)
    return () => abort.abort()
  }, [panel.jobId])

  useEffect(() => {
    if (!appResult || openState !== 'idle') return
    if (panel.kind === 'view' || panel.kind === 'content') {
      setOpenState('settled')
      return
    }
    setOpenState('opening')
    void openGenerated(appResult, panel.kind !== 'fix').finally(() => setOpenState('settled'))
  }, [appResult, openState, panel.kind])

  useEffect(() => {
    if (!canDismiss || hover) return
    const timer = window.setTimeout(() => closePanel(), 4000)
    return () => window.clearTimeout(timer)
  }, [canDismiss, hover])

  const steps = stepList(events, Boolean(done))
  const elapsed = formatElapsed((frozen ?? now) - started)
  const heading = ready && appResult ? `${name} is ready` : failed ? 'Stopped' : `Generating with ${label}…`

  return createPortal(
    <section
      className="gen-panel"
      role="dialog"
      aria-label={heading}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <header className="gen-panel-bar">
        {ready && appResult ? (
          <div className="gen-ready">
            <AppTile id={appResult.appId} icon={app?.icon || 'Sparkles'} tint={app?.tint} size={36} />
            <Heading level={2}>{heading}</Heading>
          </div>
        ) : (
          <Heading level={2}>{heading}</Heading>
        )}
        <Text muted size="sm">{elapsed}</Text>
      </header>
      {ready ? null : (
        <>
          <p className="gen-prompt">{clip(panel.prompt, 180)}</p>
          <ol className="gen-steps">
            {steps.map((step) => (
              <li key={step.id} className={step.current ? 'is-current' : 'is-done'}>
                <span className="gen-step-mark" aria-hidden />
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
          {thinking && thinking.type === 'thinking' && !failed ? <p className="gen-think">{thinking.text}</p> : null}
          {failed && error && error.type === 'error' ? <p className="gen-error">{error.message}</p> : null}
        </>
      )}
      <Stack gap={8}>
        {showOpen && appResult ? (
          <Button variant="primary" onClick={() => void openGenerated(appResult, false)}>
            Open {name}
          </Button>
        ) : null}
        {failed ? (
          <Button variant="primary" onClick={panel.retry}>
            Retry with {label}
          </Button>
        ) : null}
        {!finished ? (
          <Button variant="ghost" onClick={() => cancelPanel(panel.jobId)}>
            <Spinner size={12} /> Cancel
          </Button>
        ) : null}
        {failed || showOpen ? (
          <Button variant="ghost" onClick={closePanel}>
            Close
          </Button>
        ) : null}
      </Stack>
    </section>,
    document.body,
  )
}

function stepList(events: JobEvent[], finished: boolean): { id: string; label: string; current: boolean }[] {
  const steps: { id: string; label: string }[] = []
  const touch = (id: string, label: string) => {
    const found = steps.find((step) => step.id === id)
    if (found) found.label = label
    else steps.push({ id, label })
  }
  for (const event of events) {
    if (event.type === 'status') touch(event.step || 'status', event.text)
    if (event.type === 'tool') touch('writing', event.text)
    if (event.type === 'error') touch('error', 'Could not finish')
  }
  if (!steps.length) steps.push({ id: 'queued', label: 'Queued' })
  if (finished) touch('done', 'Done')
  return steps.map((step, index) => ({ ...step, current: !finished && index === steps.length - 1 }))
}

function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trim()}…`
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}
