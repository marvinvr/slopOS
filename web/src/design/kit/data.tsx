import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

type Box = { className?: string; style?: CSSProperties; children?: ReactNode }

const AVATAR_TINTS = ['#f0d3c4', '#ead7b8', '#d5e3d4', '#e4d4ea', '#d5dee8', '#f3d5c4', '#e7d7cb', '#f0d0da']

export type AvatarProps = {
  name: string
  src?: string
  size?: number
  className?: string
  style?: CSSProperties
}

export function Avatar({ name, src, size = 28, className, style }: AvatarProps) {
  const tint = AVATAR_TINTS[hash(name) % AVATAR_TINTS.length]
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      className={cx('slop-avatar', className)}
      style={{ width: size, height: size, background: src ? undefined : tint, fontSize: Math.max(10, Math.round(size * 0.38)), ...style }}
      aria-label={name}
    >
      {src ? <img src={src} alt="" /> : initials || '·'}
    </span>
  )
}

export type TagProps = Box & {
  tone?: 'neutral' | 'accent' | 'danger' | 'success' | 'warning'
  onRemove?: () => void
}

export function Tag({ tone = 'neutral', onRemove, className, style, children }: TagProps) {
  return (
    <span className={cx('slop-tag', tone !== 'neutral' && tone, className)} style={style}>
      {children}
      {onRemove ? (
        <button type="button" aria-label="Remove" onClick={onRemove}>
          <Icon name="X" size={11} />
        </button>
      ) : null}
    </span>
  )
}

export const Chip = function Chip({
  selected,
  onClick,
  disabled,
  size = 'md',
  square,
  current,
  className,
  style,
  children,
}: Box & {
  selected?: boolean
  onClick?: () => void
  disabled?: boolean
  size?: 'sm' | 'md'
  /** Equal box for a day or a single mark. A pill is the default. */
  square?: boolean
  /** Draws the quiet ring for "this one is now" (today, the current step). */
  current?: boolean
}) {
  return (
    <button
      type="button"
      className={cx('slop-chip', size === 'sm' && 'sm', square && 'square', current && 'is-current', selected && 'is-on', className)}
      style={style}
      aria-pressed={selected}
      aria-current={current || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export type LinkProps = Box & {
  onClick?: () => void
  intent?: string
  disabled?: boolean
}

export function Link({ onClick, intent, disabled, className, style, children }: LinkProps) {
  void intent
  return (
    <button type="button" className={cx('slop-link', className)} style={style} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

export type Column<T> = {
  key: string
  header: string
  sortable?: boolean
  align?: 'start' | 'end'
  width?: string | number
  render?: (row: T) => ReactNode
}

export type TableProps<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey?: (row: T, index: number) => string
  sort?: { key: string; dir: 'asc' | 'desc' }
  onSort?: (key: string, dir: 'asc' | 'desc') => void
  empty?: ReactNode
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}

export function Table<T>({ columns, rows, rowKey, sort, onSort, empty = 'Nothing here', className, style, ...rest }: TableProps<T>) {
  const [inner, setInner] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const active = sort ?? inner
  const shown = useMemo(() => {
    if (!active || onSort) return rows
    const copy = [...rows]
    copy.sort((a, b) => compare(read(a, active.key), read(b, active.key)) * (active.dir === 'asc' ? 1 : -1))
    return copy
  }, [rows, active, onSort])

  function toggle(key: string) {
    const dir = active?.key === key && active.dir === 'asc' ? 'desc' : 'asc'
    if (onSort) onSort(key, dir)
    else setInner({ key, dir })
  }

  return (
    <table className={cx('slop-table', className)} style={style} aria-label={rest['aria-label']}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} style={{ width: column.width, textAlign: column.align === 'end' ? 'right' : 'left' }}>
              {column.sortable ? (
                <button type="button" className={cx(active?.key === column.key && 'is-sorted')} onClick={() => toggle(column.key)}>
                  {column.header}
                  {active?.key === column.key ? <Icon name={active.dir === 'asc' ? 'ChevronUp' : 'ChevronDown'} size={12} /> : null}
                </button>
              ) : (
                column.header
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {shown.length === 0 ? (
          <tr>
            <td className="slop-table-empty" colSpan={Math.max(1, columns.length)}>
              {empty}
            </td>
          </tr>
        ) : (
          shown.map((row, index) => (
            <tr key={rowKey ? rowKey(row, index) : index}>
              {columns.map((column) => (
                <td key={column.key} style={{ textAlign: column.align === 'end' ? 'right' : 'left' }}>
                  {column.render ? column.render(row) : show(read(row, column.key))}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

function read(row: unknown, key: string): unknown {
  if (!row || typeof row !== 'object') return undefined
  return (row as Record<string, unknown>)[key]
}

function show(value: unknown): ReactNode {
  if (value == null || value === false) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return value as ReactNode
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a ?? '').localeCompare(String(b ?? ''))
}

function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0
  return h
}
