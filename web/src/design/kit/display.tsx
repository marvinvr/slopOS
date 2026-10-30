import type { CSSProperties, ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

type Box = { className?: string; style?: CSSProperties; children?: ReactNode }

export type HeadingProps = Box & { level?: 1 | 2 | 3 }
export function Heading({ level = 1, className, style, children }: HeadingProps) {
  const Tag = (`h${level}` as 'h1' | 'h2' | 'h3')
  return (
    <Tag className={cx('slop-heading', `h${level}`, className)} style={style}>
      {children}
    </Tag>
  )
}

export type StatProps = Box & {
  value: ReactNode
  label?: ReactNode
  /** `lg` is the one display moment. `md` is a section count. */
  size?: 'md' | 'lg'
}
export function Stat({ value, label, size = 'lg', className, style }: StatProps) {
  return (
    <div className={cx('slop-stat', size === 'md' && 'md', className)} style={style}>
      <p className="slop-stat-value">{value}</p>
      {label != null && label !== false ? <p className="slop-stat-label">{label}</p> : null}
    </div>
  )
}

export type TextProps = Box & { muted?: boolean; size?: 'xs' | 'sm' | 'md' | 'lg' }
export function Text({ muted, size = 'md', className, style, children }: TextProps) {
  return (
    <p className={cx('slop-text', muted && 'muted', size, className)} style={style}>
      {children}
    </p>
  )
}

export type BadgeProps = Box & { tone?: 'neutral' | 'accent' | 'danger' | 'success' | 'warning' }
export function Badge({ tone = 'neutral', className, style, children }: BadgeProps) {
  return (
    <span className={cx('slop-badge', tone !== 'neutral' && tone, className)} style={style}>
      {children}
    </span>
  )
}

export type EmptyStateProps = {
  icon?: string
  title: string
  body?: string
  className?: string
  style?: CSSProperties
  children?: ReactNode
}
export function EmptyState({ icon, title, body, className, style, children }: EmptyStateProps) {
  return (
    <div className={cx('slop-empty', className)} style={style}>
      {icon ? (
        <div className="slop-empty-icon">
          <Icon name={icon} size={22} />
        </div>
      ) : null}
      <Heading level={2}>{title}</Heading>
      {body ? <Text muted>{body}</Text> : null}
      {children}
    </div>
  )
}

export function Spinner({ size = 16, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return <span className={cx('slop-spinner', className)} style={{ width: size, height: size, ...style }} role="status" aria-label="Loading" />
}

export function Kbd({ className, style, children }: Box) {
  return (
    <kbd className={cx('slop-kbd', className)} style={style}>
      {children}
    </kbd>
  )
}

export type ListProps = Box & { 'aria-label'?: string }
export function List({ className, style, children, ...rest }: ListProps) {
  return (
    <ul className={cx('slop-list', className)} style={style} role="listbox" aria-label={rest['aria-label']}>
      {children}
    </ul>
  )
}

export type ListItemProps = {
  icon?: string
  title: string
  subtitle?: string
  trailing?: ReactNode
  selected?: boolean
  disabled?: boolean
  /** Used when `onClick` is omitted. Defaults to `title`. */
  intent?: string
  onClick?: () => void
  className?: string
  style?: CSSProperties
}
export function ListItem({ icon, title, subtitle, trailing, selected, disabled, intent, onClick, className, style }: ListItemProps) {
  void intent
  return (
    <li>
      <button
        type="button"
        className={cx('slop-list-item', className)}
        style={style}
        role="option"
        aria-selected={Boolean(selected)}
        disabled={disabled}
        onClick={onClick}
      >
        {icon ? (
          <span className="slop-list-icon">
            <Icon name={icon} size={16} />
          </span>
        ) : (
          <span />
        )}
        <span className="slop-list-item-text">
          <span className="slop-list-item-title">{title}</span>
          {subtitle ? <span className="slop-list-item-sub">{subtitle}</span> : null}
        </span>
        {trailing ? <span>{trailing}</span> : <span />}
      </button>
    </li>
  )
}

export type TabsProps = {
  tabs: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}
export function Tabs({ tabs, value, onChange, className, style, ...rest }: TabsProps) {
  return (
    <div className={cx('slop-tabs', className)} style={style} role="tablist" aria-label={rest['aria-label']}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          className="slop-tab"
          role="tab"
          aria-selected={tab.value === value}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
