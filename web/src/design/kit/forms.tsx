import { useState, type CSSProperties, type FormEvent } from 'react'
import { cx } from './cx'
import { useGenerativeApi } from './generative'
import { Icon } from './Icon'
import { Stack } from './layout'

type Box = { className?: string; style?: CSSProperties; disabled?: boolean; size?: 'sm' | 'md' }

export type SearchFieldProps = Box & {
  value?: string
  defaultValue?: string
  placeholder?: string
  'aria-label'?: string
  onChange?: (value: string) => void
  /** Enter / submit. Omit it and a non-empty query opens a generated results screen. */
  onSearch?: (value: string) => void
  intent?: string
}

export function SearchField({
  value,
  defaultValue,
  placeholder = 'Search',
  size = 'md',
  disabled,
  onChange,
  onSearch,
  intent,
  className,
  style,
  ...rest
}: SearchFieldProps) {
  const api = useGenerativeApi()
  const [local, setLocal] = useState(defaultValue ?? '')
  const text = value !== undefined ? value : local
  const generative = !onSearch && !disabled && Boolean(api)
  const busy = generative && api?.busy === (intent?.trim() || text.trim())

  function set(next: string) {
    if (value === undefined) setLocal(next)
    onChange?.(next)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const query = text.trim()
    if (!query || disabled) return
    if (onSearch) {
      onSearch(query)
      return
    }
    api?.open(intent?.trim() || query)
  }

  return (
    <form
      role="search"
      className={cx('slop-search', size === 'sm' && 'sm', generative && 'slop-generative', busy && 'is-busy', className)}
      style={style}
      onSubmit={submit}
    >
      <Icon name="Search" size={size === 'sm' ? 13 : 14} />
      <input
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={rest['aria-label'] ?? placeholder}
        onChange={(event) => set(event.target.value)}
      />
    </form>
  )
}

export type NumberInputProps = Box & {
  value?: number
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  'aria-label'?: string
  onChange?: (value: number) => void
}

export function NumberInput({
  value,
  defaultValue,
  min,
  max,
  step = 1,
  size = 'md',
  disabled,
  onChange,
  className,
  style,
  ...rest
}: NumberInputProps) {
  const [local, setLocal] = useState(defaultValue ?? min ?? 0)
  const current = value !== undefined ? value : local

  function commit(next: number) {
    if (!Number.isFinite(next)) return
    const snapped = step > 0 ? Math.round(next / step) * step : next
    const bounded = Math.min(max ?? snapped, Math.max(min ?? snapped, snapped))
    const rounded = Number(bounded.toFixed(6))
    if (value === undefined) setLocal(rounded)
    onChange?.(rounded)
  }

  return (
    <div className={cx('slop-stepper', size === 'sm' && 'sm', disabled && 'is-disabled', className)} style={style}>
      <button type="button" aria-label="Decrease" disabled={disabled || (min != null && current <= min)} onClick={() => commit(current - step)}>
        <Icon name="Minus" size={14} />
      </button>
      <input
        inputMode="decimal"
        aria-label={rest['aria-label']}
        value={Number.isFinite(current) ? String(current) : ''}
        disabled={disabled}
        onChange={(event) => {
          const parsed = Number(event.target.value)
          if (event.target.value.trim() === '' || Number.isNaN(parsed)) return
          commit(parsed)
        }}
      />
      <button type="button" aria-label="Increase" disabled={disabled || (max != null && current >= max)} onClick={() => commit(current + step)}>
        <Icon name="Plus" size={14} />
      </button>
    </div>
  )
}

export const Stepper = NumberInput

export type SegmentedControlProps = {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}

export function SegmentedControl({ value, onChange, options, size = 'md', disabled, className, style, ...rest }: SegmentedControlProps) {
  return (
    <div
      className={cx('slop-seg', size === 'sm' && 'sm', className)}
      style={style}
      role="radiogroup"
      aria-label={rest['aria-label']}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export const SLOP_SWATCHES = ['#e4532d', '#3b82f6', '#2f9e6b', '#8b5cf6', '#6b6560', '#e25b7a', '#e6b86a', '#1f1d1a'] as const

export type ColorSwatchProps = {
  value?: string
  onChange?: (value: string) => void
  colors?: readonly string[]
  disabled?: boolean
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}

export function ColorSwatch({ value, onChange, colors = SLOP_SWATCHES, disabled, className, style, ...rest }: ColorSwatchProps) {
  return (
    <div className={cx('slop-swatches', className)} style={style} role="radiogroup" aria-label={rest['aria-label'] ?? 'Color'}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className="slop-swatch"
          style={{ background: color }}
          role="radio"
          aria-checked={value?.toLowerCase() === color.toLowerCase()}
          aria-label={color}
          disabled={disabled}
          onClick={() => onChange?.(color)}
        />
      ))}
    </div>
  )
}

export type ProgressBarProps = {
  /** Omit for an indeterminate bar. */
  value?: number
  max?: number
  label?: string
  className?: string
  style?: CSSProperties
}

/** Centered indeterminate bar for the moment before `useStorage` has loaded. */
export function Loading({ label = 'Opening' }: { label?: string }) {
  return (
    <Stack align="center" justify="center" fill>
      <div style={{ width: 160 }}>
        <ProgressBar label={label} />
      </div>
    </Stack>
  )
}

export function ProgressBar({ value, max = 1, label, className, style }: ProgressBarProps) {
  const ratio = value == null || !Number.isFinite(value) || max === 0 ? undefined : Math.max(0, Math.min(1, value / max))
  return (
    <div
      className={cx('slop-progress', className)}
      style={style}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className={cx('slop-progress-fill', ratio == null && 'is-indeterminate')} style={ratio != null ? { width: `${ratio * 100}%` } : undefined} />
    </div>
  )
}
