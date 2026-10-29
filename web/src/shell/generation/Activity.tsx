import { useEffect, useState } from 'react'
import { Icon, Text } from '../../design/kit'
import { EditDialog } from './EditDialog'
import { GenerationPanel } from './Panel'
import { jobActive, noteRuntimeError, providerLabel, refreshJobs, refreshStatus, useGeneration } from './state'
import { useShell } from '../store'

export function GenerationActivity() {
  const { status, jobs, panel, editAppId } = useGeneration()
  const [open, setOpen] = useState(false)
  const windows = useShell((state) => state.windows)
  const errors = useShell((state) => state.windowErrors)
  const apps = useShell((state) => state.apps)
  const running = jobs.some(jobActive)
  const label = providerLabel(status.provider)

  useEffect(() => {
    void refreshStatus(true)
    void refreshJobs()
    const timer = window.setInterval(() => {
      void refreshStatus()
      void refreshJobs()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    for (const win of windows) {
      const error = errors[win.id]
      if (!error) continue
      const app = apps.find((item) => item.id === win.appId)
      if (!app || app.fixture) continue
      const message = error.stack ? `${error.message}\n${error.stack}` : error.message
      noteRuntimeError(win.id, win.appId, win.version, message, app.name)
    }
  }, [apps, errors, windows])

  return (
    <div className="gen-activity">
      <button
        type="button"
        className={running ? 'gen-spark is-on' : 'gen-spark'}
        aria-label={running ? `${label} is generating` : `Generation, ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="Sparkles" size={14} />
      </button>
      {open ? (
        <div className="gen-queue" role="dialog" aria-label="Generation queue">
          {!status.available ? <Text size="sm">{status.reason || `${label} isn't available`}</Text> : null}
          {status.available && !jobs.length ? <Text muted size="sm">Nothing generating.</Text> : null}
          {jobs.slice(0, 6).map((job) => (
            <div key={job.id} className="gen-queue-row">
              <Text size="sm">{clip(job.prompt, 72)}</Text>
              <Text muted size="xs">{job.state}</Text>
            </div>
          ))}
        </div>
      ) : null}
      {panel ? <GenerationPanel panel={panel} /> : null}
      {editAppId ? <EditDialog appId={editAppId} /> : null}
    </div>
  )
}

function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trim()}…`
}
