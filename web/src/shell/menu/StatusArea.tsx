import { useEffect, useState } from 'react'
import { GenerationActivity } from '../generation'

const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export function StatusArea() {
  const [now, setNow] = useState(() => new Date())
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.shell-status')) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="shell-status">
      <GenerationActivity />
      <button type="button" className="shell-clock" aria-expanded={open} aria-label="Date and time" onClick={() => setOpen((value) => !value)}>
        <span className="shell-clock-date">{date}</span>
        <span>{time}</span>
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
  const title = now.toLocaleDateString([], { month: 'long', year: 'numeric' })
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
