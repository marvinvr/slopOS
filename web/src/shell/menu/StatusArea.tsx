import { useEffect, useState } from 'react'
import { Icon } from '../../design/kit'
import { cx } from '../../design/kit/cx'
import { GenerationActivity, useGrokStatus, type GrokStatus } from '../generation'
import { pushLayer } from '../layers'

const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

type GeneratorPhase = 'is-ready' | 'is-busy' | 'is-off'

function generatorView(grok: GrokStatus): { phase: GeneratorPhase; label: string } {
  const busy = Boolean((grok as GrokStatus & { busy?: boolean }).busy)
  if (busy) return { phase: 'is-busy', label: 'Grok is writing…' }
  if (grok.available) {
    const model = grok.model ? ` · ${grok.model}` : ''
    return { phase: 'is-ready', label: `Grok ready${model}` }
  }
  const reason = grok.reason ? ` · ${grok.reason}` : ''
  return { phase: 'is-off', label: `Grok unavailable${reason}` }
}

export function StatusArea() {
  const [now, setNow] = useState(() => new Date())
  const [open, setOpen] = useState(false)
  const [online, setOnline] = useState(true)
  const grok = useGrokStatus()

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
    return pushLayer(() => setOpen(false))
  }, [open])

  const weekday = now.toLocaleDateString('en-GB', { weekday: 'short' })
  const month = now.toLocaleDateString('en-GB', { month: 'short' })
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const clock = `${weekday} ${now.getDate()} ${month}  ${hours}:${minutes}`
  const generator = generatorView(grok)

  return (
    <div className="shell-status">
      <GenerationActivity />
      <span className={online ? 'shell-status-icon' : 'shell-status-icon is-down'} role="img" tabIndex={0} aria-label={online ? 'Connected' : 'Can’t reach slopOS'}>
        <Icon name={online ? 'Wifi' : 'WifiOff'} size={14} />
        <span className="shell-status-tip" role="tooltip">
          {online ? 'Connected' : 'Can’t reach slopOS'}
        </span>
      </span>
      <span className={cx('shell-status-icon', 'shell-grok', generator.phase)} role="img" tabIndex={0} aria-label={generator.label}>
        <Icon name="Sparkles" size={14} />
        <span className="shell-status-tip" role="tooltip">
          {generator.label}
        </span>
      </span>
      <button type="button" className="shell-clock" aria-expanded={open} aria-label="Date and time" onClick={() => setOpen((value) => !value)}>
        <span>{clock}</span>
      </button>
      {open ? <Calendar now={now} /> : null}
    </div>
  )
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
