import type { ComponentType, CSSProperties } from 'react'
import * as Lucide from 'lucide-react'
import { cx } from './cx'

type IconCmp = ComponentType<{ size?: number; strokeWidth?: number }>

const icons = Lucide as unknown as Record<string, unknown>

/** Lucide also exports helpers. Those are not icons. */
const NOT_ICONS = new Set(['createLucideIcon', 'Icon', 'icons', 'default'])

export type IconProps = {
  name: string
  size?: number
  strokeWidth?: number
  className?: string
  style?: CSSProperties
}

/** Lucide icons are `forwardRef` objects (`typeof 'object'`), not plain functions. */
function isLucideIcon(name: string, value: unknown): value is IconCmp {
  if (NOT_ICONS.has(name) || !/^[A-Z]/.test(name)) return false
  if (typeof value === 'function') return true
  if (!value || typeof value !== 'object') return false
  return typeof (value as { render?: unknown }).render === 'function'
}

export function Icon({ name, size = 16, strokeWidth = 1.75, className, style }: IconProps) {
  const Cmp = icons[name]
  if (!isLucideIcon(name, Cmp)) {
    return <span className={cx('slop-icon-missing', className)} style={{ width: size, height: size, ...style }} aria-hidden />
  }
  return (
    <span className={cx('slop-icon', className)} style={style}>
      <Cmp size={size} strokeWidth={strokeWidth} />
    </span>
  )
}
