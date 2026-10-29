import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode } from 'react'
import { cx } from './cx'
import { IconButton } from './controls'

type Box = { className?: string; style?: CSSProperties; children?: ReactNode }

export function Tooltip({ label, children, className, style }: Box & { label: string }) {
  return (
    <span className={cx('slop-tip', className)} style={style}>
      {children}
      <span className="slop-tip-bubble" role="tooltip">
        {label}
      </span>
    </span>
  )
}

export type MenuEntry =
  | { label: string; shortcut?: string; disabled?: boolean; danger?: boolean; onSelect: () => void }
  | 'separator'

export type MenuProps = {
  trigger: ReactNode
  items: MenuEntry[]
  align?: 'start' | 'end'
  className?: string
  style?: CSSProperties
}

export function Menu({ trigger, items, align = 'start', className, style }: MenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  function toggle(): void {
    setOpen((value) => !value)
  }

  // A handler-less Button used as a trigger would otherwise open a generated
  // screen. Give it a click of its own so it stays a menu.
  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<{ onClick?: (event: ReactMouseEvent) => void }>, {
        onClick: (event: ReactMouseEvent) => {
          const original = (trigger as ReactElement<{ onClick?: (event: ReactMouseEvent) => void }>).props.onClick
          original?.(event)
          if (!event.defaultPrevented) toggle()
        },
      })
    : trigger

  return (
    <div className={cx('slop-menu', className)} style={style} ref={ref}>
      <div className="slop-menu-trigger" onClick={isValidElement(trigger) ? undefined : toggle}>
        {triggerNode}
      </div>
      {open ? (
        <div className={cx('slop-popover', align === 'end' ? 'align-end' : 'align-start')} id={menuId} role="menu">
          {items.map((item, index) =>
            item === 'separator' ? (
              <div key={`sep-${index}`} className="slop-menu-sep" role="separator" />
            ) : (
              <button
                key={`${item.label}-${index}`}
                type="button"
                role="menuitem"
                className={cx('slop-menu-item', item.danger && 'danger')}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                <span>{item.label}</span>
                {item.shortcut ? <span className="slop-menu-key">{item.shortcut}</span> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}

export const DropdownMenu = Menu

export type DialogProps = Box & {
  open: boolean
  onClose: () => void
  title?: string
  width?: number
}

export function Dialog({ open, onClose, title, width = 400, className, style, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="slop-overlay" onMouseDown={onClose}>
      <div
        ref={ref}
        className={cx('slop-dialog', className)}
        style={{ width, ...style }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {title ? (
          <header className="slop-dialog-bar">
            <h2>{title}</h2>
            <IconButton icon="X" label="Close" size="sm" onClick={onClose} />
          </header>
        ) : null}
        <div className="slop-dialog-body">{children}</div>
      </div>
    </div>
  )
}

export type SheetProps = Box & {
  open: boolean
  onClose: () => void
  title?: string
  side?: 'end' | 'bottom'
}

export function Sheet({ open, onClose, title, side = 'end', className, style, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="slop-overlay slop-overlay-sheet" onMouseDown={onClose}>
      <div
        className={cx('slop-sheet', side, className)}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="slop-dialog-bar">
          <h2>{title}</h2>
          <IconButton icon="X" label="Close" size="sm" onClick={onClose} />
        </header>
        <div className="slop-dialog-body">{children}</div>
      </div>
    </div>
  )
}
