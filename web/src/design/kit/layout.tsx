import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cx } from './cx'
import { useGenerative } from './generative'

type Box = { className?: string; style?: CSSProperties; children?: ReactNode }

type FlexProps = Box & {
  gap?: number
  align?: CSSProperties['alignItems']
  justify?: CSSProperties['justifyContent']
  /** `true` means flex-grow 1. A number is the grow factor. */
  grow?: boolean | number
  /** Stretch to the window. The app root wants this. */
  fill?: boolean
  padding?: number | string
}

function flexStyle({ gap, align, justify, grow, fill, padding, style }: FlexProps): CSSProperties {
  return {
    gap,
    alignItems: align,
    justifyContent: justify,
    flexGrow: grow === true ? 1 : typeof grow === 'number' ? grow : undefined,
    minHeight: grow || fill ? 0 : undefined,
    height: fill ? '100%' : undefined,
    padding,
    ...style,
  }
}

export type StackProps = FlexProps
export function Stack({ gap = 8, align, justify, grow, fill, padding, className, style, children }: StackProps) {
  return (
    <div className={cx('slop-stack', className)} style={flexStyle({ gap, align, justify, grow, fill, padding, style })}>
      {children}
    </div>
  )
}

export type RowProps = FlexProps & { wrap?: boolean }
export function Row({ gap = 8, align = 'center', justify, grow, fill, padding, wrap, className, style, children }: RowProps) {
  return (
    <div className={cx('slop-row', wrap && 'wrap', className)} style={flexStyle({ gap, align, justify, grow, fill, padding, style })}>
      {children}
    </div>
  )
}

export type GridProps = Box & {
  /** Equal columns. Ignored when `minChildWidth` is set. */
  columns?: number
  gap?: number
  /** `auto-fit` tracks. Number is pixels. */
  minChildWidth?: number | string
  align?: CSSProperties['alignItems']
  justify?: CSSProperties['justifyContent']
}
export function Grid({ columns, gap = 12, minChildWidth, align, justify, className, style, children }: GridProps) {
  const size = typeof minChildWidth === 'number' ? `${minChildWidth}px` : minChildWidth
  const template = size
    ? `repeat(auto-fit, minmax(min(100%, ${size}), 1fr))`
    : columns
      ? `repeat(${columns}, minmax(0, 1fr))`
      : undefined
  return (
    <div className={cx('slop-grid', className)} style={{ gap, gridTemplateColumns: template, alignItems: align, justifyContent: justify, ...style }}>
      {children}
    </div>
  )
}

export type SplitViewProps = {
  sidebar: ReactNode
  children?: ReactNode
  sidebarWidth?: number
  /** Drag the hairline between sidebar and content. */
  resizable?: boolean
  minSidebar?: number
  maxSidebar?: number
  onSidebarWidthChange?: (width: number) => void
  className?: string
  style?: CSSProperties
}
export function SplitView({
  sidebar,
  children,
  sidebarWidth = 220,
  resizable = false,
  minSidebar = 160,
  maxSidebar = 420,
  onSidebarWidthChange,
  className,
  style,
}: SplitViewProps) {
  const [local, setLocal] = useState(sidebarWidth)
  const width = onSidebarWidthChange ? sidebarWidth : local
  const widthRef = useRef(width)
  widthRef.current = width

  function onHandleDown(event: ReactPointerEvent) {
    if (!resizable) return
    event.preventDefault()
    const startX = event.clientX
    const startW = widthRef.current
    const move = (ev: PointerEvent) => {
      const next = Math.min(maxSidebar, Math.max(minSidebar, Math.round(startW + (ev.clientX - startX))))
      if (onSidebarWidthChange) onSidebarWidthChange(next)
      else setLocal(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      className={cx('slop-split', className)}
      style={{ gridTemplateColumns: `${width}px minmax(0, 1fr)`, ['--slop-side' as string]: `${width}px`, ...style }}
    >
      <aside className="slop-split-side">{sidebar}</aside>
      {resizable ? (
        <div
          className="slop-split-handle"
          style={{ left: width }}
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={width}
          onPointerDown={onHandleDown}
        />
      ) : null}
      <div className="slop-split-main">{children}</div>
    </div>
  )
}

export function ScrollArea({ grow, className, style, children }: Box & { grow?: boolean }) {
  return (
    <div
      className={cx('slop-scroll', className)}
      style={{ flex: grow ? 1 : undefined, minHeight: grow ? 0 : undefined, ...style }}
    >
      {children}
    </div>
  )
}

export type ToolbarProps = Box & {
  title?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
}
export function Toolbar({ title, leading, trailing, className, style, children }: ToolbarProps) {
  return (
    <div className={cx('slop-toolbar', className)} style={style}>
      {leading ? <div className="slop-toolbar-leading">{leading}</div> : null}
      {title != null && title !== false ? <div className="slop-toolbar-title">{title}</div> : null}
      {children ? <div className="slop-toolbar-slot">{children}</div> : <div className="slop-toolbar-slot" />}
      {trailing ? <div className="slop-toolbar-trailing">{trailing}</div> : null}
    </div>
  )
}

export type CardProps = Box & {
  padding?: number | string
  onClick?: () => void
  /** Makes the card a generative destination when `onClick` is omitted. */
  intent?: string
}
export function Card({ padding, onClick, intent, className, style, children }: CardProps) {
  const gen = useGenerative({ onClick, intent, label: intent || 'Open', eligible: Boolean(onClick) || Boolean(intent) })
  const clickable = Boolean(gen.onClick)
  if (!clickable) {
    return (
      <div className={cx('slop-card', className)} style={{ padding, ...style }}>
        {children}
      </div>
    )
  }
  return (
    <div
      role="button"
      tabIndex={0}
      className={cx('slop-card', 'is-clickable', gen.generative && 'slop-generative', gen.busy && 'is-busy', className)}
      style={{ padding, ...style }}
      aria-busy={gen.busy || undefined}
      onClick={gen.onClick}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        gen.onClick?.()
      }}
    >
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

export type SectionProps = Box & { title?: string; description?: string }
export function Section({ title, description, className, style, children }: SectionProps) {
  return (
    <section className={cx('slop-section', className)} style={style}>
      {title ? <h3 className="slop-section-title">{title}</h3> : null}
      {description ? <p className="slop-section-desc">{description}</p> : null}
      {children ? <div className="slop-section-body">{children}</div> : null}
    </section>
  )
}

export type FieldProps = Box & { label: string; hint?: string }
export function Field({ label, hint, className, style, children }: FieldProps) {
  return (
    <label className={cx('slop-field', className)} style={style}>
      <span className="slop-field-label">{label}</span>
      {children}
      {hint ? <span className="slop-field-hint">{hint}</span> : null}
    </label>
  )
}
