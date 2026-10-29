import type { CSSProperties, ReactNode } from 'react'
import { cx } from './cx'

type Box = { className?: string; style?: CSSProperties; children?: ReactNode }

export type StackProps = Box & { gap?: number; align?: CSSProperties['alignItems'] }
export function Stack({ gap = 8, align, className, style, children }: StackProps) {
  return (
    <div className={cx('slop-stack', className)} style={{ gap, alignItems: align, ...style }}>
      {children}
    </div>
  )
}

export type RowProps = Box & {
  gap?: number
  align?: CSSProperties['alignItems']
  justify?: CSSProperties['justifyContent']
}
export function Row({ gap = 8, align = 'center', justify, className, style, children }: RowProps) {
  return (
    <div className={cx('slop-row', className)} style={{ gap, alignItems: align, justifyContent: justify, ...style }}>
      {children}
    </div>
  )
}

export type SplitViewProps = {
  sidebar: ReactNode
  children?: ReactNode
  sidebarWidth?: number
  className?: string
  style?: CSSProperties
}
export function SplitView({ sidebar, children, sidebarWidth = 220, className, style }: SplitViewProps) {
  return (
    <div className={cx('slop-split', className)} style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)`, ...style }}>
      <aside className="slop-split-side">{sidebar}</aside>
      <div className="slop-split-main">{children}</div>
    </div>
  )
}

export function ScrollArea({ className, style, children }: Box) {
  return (
    <div className={cx('slop-scroll', className)} style={style}>
      {children}
    </div>
  )
}

export function Toolbar({ className, style, children }: Box) {
  return (
    <div className={cx('slop-toolbar', className)} style={style}>
      {children}
    </div>
  )
}

export type CardProps = Box & { padding?: number | string; onClick?: () => void }
export function Card({ padding, onClick, className, style, children }: CardProps) {
  return (
    <div className={cx('slop-card', className)} style={{ padding, ...style }} onClick={onClick}>
      {children}
    </div>
  )
}

export function Divider({
  orientation = 'horizontal',
  className,
  style,
}: {
  orientation?: 'horizontal' | 'vertical'
  className?: string
  style?: CSSProperties
}) {
  return <hr className={cx('slop-divider', orientation, className)} style={style} />
}
