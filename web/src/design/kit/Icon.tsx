import type { ComponentType, CSSProperties } from 'react'
import * as Lucide from 'lucide-react'
import { cx } from './cx'

type IconCmp = ComponentType<{ size?: number; strokeWidth?: number }>

const icons = Lucide as unknown as Record<string, IconCmp>

export type IconProps = {
  name: string
  size?: number
  strokeWidth?: number
  className?: string
  style?: CSSProperties
}

export function Icon({ name, size = 16, strokeWidth = 1.75, className, style }: IconProps) {
  const Cmp = icons[name]
  if (typeof Cmp !== 'function') {
    return <span className={cx('slop-icon-missing', className)} style={{ width: size, height: size, ...style }} aria-hidden />
  }
  return (
    <span className={cx('slop-icon', className)} style={style}>
      <Cmp size={size} strokeWidth={strokeWidth} />
    </span>
  )
}
