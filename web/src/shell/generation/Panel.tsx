import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Heading, Spinner, Stack, Text } from '../../design/kit'
import { streamJobEvents, type JobEvent } from './api'
import { cancelPanel, closePanel, openGenerated, providerLabel, useGeneration, type PanelJob } from './state'

export function GenerationPanel({ panel }: { panel: PanelJob }) {
  const status = useGeneration().status
  const [events, setEvents] = useState<JobEvent[]>([])
  const [started] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const abort = new AbortController()
    setEvents([])
    streamJobEvents(panel.jobId, (event) => setEvents((prev) => [...prev, event]), abort.signal).catch(() => undefined)
    return () => abort.abort()
  }, [panel.jobId])

  const done = events.find((event) => event.type === 'done')
  const error = [...events].reverse().find((event) => event.type === 'error')
  const thinking = [...events].reverse().find((event) => event.type === 'thinking')
  const result = done && done.type === 'done' ? done.result : undefined
  const failed = Boolean(error) && !done
  const steps = stepList(events, Boolean(done))

  useEffect(() => {
    if (opened || !result || result.kind !== 'app') return
    if (panel.kind === 'view' || panel.kind === 'content') return
    setOpened(true)
    void openGenerated(result, panel.kind !== 'fix')
  }, [opened, panel.kind, result])

  const name = result && result.kind === 'app' ? result.name || 'app' : ''
  const elapsed = formatElapsed(now - started)

  return createPortal(
    <section className="gen-panel" role="dialog" aria-label="Generating">
      <header className="gen-panel-bar">
        <Heading level={2}>{done ? 'Ready' : failed ? 'Stopped' : 'Generating'}</Heading>
        <Text muted size="sm">{elapsed}</Text>
      </header>
      <p className="gen-prompt">{clip(panel.prompt, 180)}</p>
      <ol className="gen-steps">
        {steps.map((step) => (
          <li key={step.id} className={step.current ? 'is-current' : 'is-done'}>
            <span className="gen-step-mark" aria-hidden />
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
      {thinking && thinking.type === 'thinking' && !done && !failed ? <p className="gen-think">{thinking.text}</p> : null}
      {failed && error && error.type === 'error' ? <p className="gen-error">{error.message}</p> : null}
      <Stack gap={8}>
        {done && result?.kind === 'app' ? (
          <Button variant="primary" onClick={() => void openGenerated(result, false)}>
            Open {name}
          </Button>
        ) : null}
        {failed ? (
          <Button variant="primary" onClick={panel.retry}>
            Retry with {providerLabel(status.provider)}
          </Button>
        ) : null}
        {!done && !failed ? (
          <Button variant="ghost" onClick={() => cancelPanel(panel.jobId)}>
            <Spinner size={12} /> Cancel
          </Button>
        ) : (
          <Button variant="ghost" onClick={closePanel}>
            Close
          </Button>
        )}
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
