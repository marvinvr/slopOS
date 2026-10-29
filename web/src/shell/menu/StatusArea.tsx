import { useEffect, useState } from 'react'
import { Icon, Text } from '../../design/kit'
import { cx } from '../../design/kit/cx'
import { GenerationActivity, jobActive, providerLabel, useGeneration } from '../generation'
import { pushLayer } from '../layers'
import { useShell } from '../store'

const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

type GeneratorPhase = 'is-ready' | 'is-busy' | 'is-off'

export function StatusArea() {
  const [now, setNow] = useState(() => new Date())
  const [open, setOpen] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [online, setOnline] = useState(true)
  const { status, jobs } = useGeneration()
  const openApp = useShell((state) => state.openApp)
  const running = jobs.some(jobActive)
  const provider = providerLabel(status.provider)
  const phase: GeneratorPhase = running ? 'is-busy' : status.available ? 'is-ready' : 'is-off'
  const genLabel = running ? `${provider} is generating` : status.available ? `${provider} ready` : `${provider} unavailable`
  const activeJobs = jobs.filter(jobActive)
  const recentJobs = jobs.filter((job) => !jobActive(job)).slice(0, 6)

  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancel = false
    const ping = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!cancel) setOnline(false)
        return
      }
      fetch('/api/health', { cache: 'no-store' })
        .then((res) => {
          if (!cancel) setOnline(res.ok)
        })
        .catch(() => {
          if (!cancel) setOnline(false)
        })
    }
    ping()
    const timer = window.setInterval(ping, 20_000)
    const off = () => setOnline(false)
    window.addEventListener('offline', off)
    window.addEventListener('online', ping)
    return () => {
      cancel = true
      window.clearInterval(timer)
      window.removeEventListener('offline', off)
      window.removeEventListener('online', ping)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.shell-status')) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [open])

  useEffect(() => {
    if (!open) return
    setGenOpen(false)
    return pushLayer(() => setOpen(false))
  }, [open])

  useEffect(() => {
    if (!genOpen) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.shell-gen')) setGenOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGenOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [genOpen])

  useEffect(() => {
    if (!genOpen) return
    return pushLayer(() => setGenOpen(false))
  }, [genOpen])

  const weekday = now.toLocaleDateString('en-GB', { weekday: 'short' })
  const month = now.toLocaleDateString('en-GB', { month: 'short' })
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const clock = `${weekday} ${now.getDate()} ${month}  ${hours}:${minutes}`

  return (
    <div className="shell-status">
      <GenerationActivity />
      <span className={online ? 'shell-status-icon' : 'shell-status-icon is-down'} role="img" tabIndex={0} aria-label={online ? 'Connected' : 'Can’t reach slopOS'}>
        <Icon name={online ? 'Wifi' : 'WifiOff'} size={14} />
        <span className="shell-status-tip" role="tooltip">
          {online ? 'Connected' : 'Can’t reach slopOS'}
        </span>
      </span>
      <span className="shell-gen">
        <button
          type="button"
          className={cx('shell-status-icon', 'shell-gen', phase)}
          aria-label={genLabel}
          aria-expanded={genOpen}
          onClick={() => {
            setOpen(false)
            setGenOpen((value) => !value)
          }}
        >
          <Icon name="Sparkles" size={14} />
          <span className="shell-gen-dot" aria-hidden />
        </button>
        {genOpen ? (
          <div className="gen-queue" role="dialog" aria-label={genLabel}>
            <p className="gen-status-line">
              {provider}
              {status.model ? ` · ${status.model}` : ''}
              {status.effort ? ` · ${status.effort}` : ''}
            </p>
            {!status.available ? <Text size="sm">{status.reason || `${provider} isn't available`}</Text> : null}
            {activeJobs.length ? <p className="gen-status-kicker">Queue</p> : null}
            {activeJobs.map((job) => (
              <div key={job.id} className="gen-queue-row">
                <Text size="sm">{clip(job.prompt, 72)}</Text>
                <Text muted size="xs">{job.state}</Text>
              </div>
            ))}
            {status.available && !activeJobs.length ? <Text muted size="sm">Nothing generating.</Text> : null}
            {recentJobs.length ? <p className="gen-status-kicker">Recent</p> : null}
            {recentJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className="gen-queue-row"
                disabled={!job.appId}
                onClick={() => {
                  if (!job.appId) return
                  openApp(job.appId)
                  setGenOpen(false)
                }}
              >
                <span>{clip(job.prompt, 72)}</span>
                <span className="gen-queue-meta">{job.state}</span>
              </button>
            ))}
          </div>
        ) : null}
      </span>
      <button type="button" className="shell-clock" aria-expanded={open} aria-label="Date and time" onClick={() => setOpen((value) => !value)}>
        <span>{clock}</span>
      </button>
      {open ? <Calendar now={now} /> : null}
    </div>
  )
}

function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trim()}…`
}

function Calendar({ now }: { now: Date }) {
  const year = now.getFullYear()
  const month = now.getMonth()
  const firstPad = (new Date(year, month, 1).getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells: Array<number | null> = [...Array(firstPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const title = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  return (
    <div className="shell-calendar" role="dialog" aria-label={title}>
      <div className="shell-calendar-title">{title}</div>
      <div className="shell-calendar-grid">
        {WEEK.map((day) => (
          <div key={day} className="shell-calendar-dow">
            {day}
          </div>
        ))}
        {cells.map((day, index) => (
          <div key={index} className={day === now.getDate() ? 'shell-calendar-day is-today' : 'shell-calendar-day'}>
            {day ?? ''}
          </div>
        ))}
      </div>
    </div>
  )
}
