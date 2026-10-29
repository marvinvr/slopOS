import type { CSSProperties, ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

type Common = { className?: string; style?: CSSProperties; disabled?: boolean }

export type ButtonProps = Common & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  type?: 'button' | 'submit' | 'reset'
  title?: string
  onClick?: () => void
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  disabled,
  title,
  onClick,
  className,
  style,
  children,
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('slop-btn', variant, size === 'sm' && 'sm', className)}
      style={style}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export type IconButtonProps = Common & {
  icon: string
  label: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  onClick?: () => void
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  disabled,
  onClick,
  className,
  style,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={cx('slop-icon-btn', variant, size === 'sm' && 'sm', className)}
      style={style}
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} size={size === 'sm' ? 14 : 16} />
    </button>
  )
}

export type InputProps = Common & {
  value?: string
  defaultValue?: string
  placeholder?: string
  type?: string
  autoFocus?: boolean
  'aria-label'?: string
  onChange?: (value: string) => void
}

export function Input({
  value,
  defaultValue,
  placeholder,
  type = 'text',
  autoFocus,
  disabled,
  onChange,
  className,
  style,
  ...rest
}: InputProps) {
  const ariaLabel = rest['aria-label']
  return (
    <input
      className={cx('slop-input', className)}
      style={style}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      placeholder={placeholder}
      type={type}
      autoFocus={autoFocus}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange?.(e.target.value)}
    />
  )
}

export type TextAreaProps = Common & {
  value?: string
  defaultValue?: string
  placeholder?: string
  rows?: number
  'aria-label'?: string
  onChange?: (value: string) => void
}

export function TextArea({
  value,
  defaultValue,
  placeholder,
  rows,
  disabled,
  onChange,
  className,
  style,
  ...rest
}: TextAreaProps) {
  return (
    <textarea
      className={cx('slop-textarea', className)}
      style={style}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      aria-label={rest['aria-label']}
      onChange={(e) => onChange?.(e.target.value)}
    />
  )
}

export type SelectProps = Common & {
  value?: string
  onChange?: (value: string) => void
  options: { value: string; label: string }[]
  'aria-label'?: string
}

export function Select({ value, onChange, options, disabled, className, style, ...rest }: SelectProps) {
  return (
    <select
      className={cx('slop-select', className)}
      style={style}
      value={value}
      disabled={disabled}
      aria-label={rest['aria-label']}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export type CheckboxProps = Common & {
  checked?: boolean
  onChange?: (checked: boolean) => void
  label?: string
}

export function Checkbox({ checked = false, onChange, label, disabled, className, style }: CheckboxProps) {
  return (
    <label className={cx('slop-check', className)} style={style}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      {label ? <span>{label}</span> : null}
    </label>
  )
}

export type SwitchProps = Common & {
  checked?: boolean
  onChange?: (checked: boolean) => void
  label?: string
  'aria-label'?: string
}

export function Switch({ checked = false, onChange, label, disabled, className, style, ...rest }: SwitchProps) {
  return (
    <label className={cx('slop-switch', className)} style={style}>
      <button
        type="button"
        role="switch"
        className={cx('slop-switch-track', checked && 'is-on')}
        aria-checked={checked}
        aria-label={rest['aria-label'] ?? label}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
      >
        <span className="slop-switch-thumb" />
      </button>
      {label ? <span>{label}</span> : null}
    </label>
  )
}

export type SliderProps = Common & {
  value?: number
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  onChange?: (value: number) => void
  'aria-label'?: string
}

export function Slider({
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  disabled,
  className,
  style,
  ...rest
}: SliderProps) {
  return (
    <input
      className={cx('slop-slider', className)}
      style={style}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      disabled={disabled}
      aria-label={rest['aria-label']}
      onChange={(e) => onChange?.(Number(e.target.value))}
    />
  )
}
