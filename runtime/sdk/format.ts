import { useState } from 'react'
import { useInterval } from './hooks'

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useInterval(() => setNow(new Date()), intervalMs > 0 ? intervalMs : null)
  return now
}

function toDate(value: Date | number | string): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatters = {
  date(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
    const date = toDate(value)
    if (!date) return ''
    return new Intl.DateTimeFormat(undefined, options ?? { dateStyle: 'medium' }).format(date)
  },
  time(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
    const date = toDate(value)
    if (!date) return ''
    return new Intl.DateTimeFormat(undefined, options ?? { timeStyle: 'short' }).format(date)
  },
  relative(value: Date | number | string, now: number = Date.now()): string {
    const date = toDate(value)
    if (!date) return ''
    const seconds = Math.round((date.getTime() - now) / 1000)
    const abs = Math.abs(seconds)
    const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
    if (abs < 60) return format.format(seconds, 'second')
    if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute')
    if (abs < 86400) return format.format(Math.round(seconds / 3600), 'hour')
    if (abs < 86400 * 30) return format.format(Math.round(seconds / 86400), 'day')
    if (abs < 86400 * 365) return format.format(Math.round(seconds / (86400 * 30)), 'month')
    return format.format(Math.round(seconds / (86400 * 365)), 'year')
  },
  number(value: number, options?: Intl.NumberFormatOptions): string {
    if (!Number.isFinite(value)) return ''
    return new Intl.NumberFormat(undefined, options).format(value)
  },
}
