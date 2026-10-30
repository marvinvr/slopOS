import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode, type RefObject } from 'react'
import { cx } from './cx'
import { IconButton } from './controls'

type Box = { className?: string; style?: CSSProperties; children?: ReactNode }

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
  useOverlayKeys(open, () => setOpen(false), ref, 'menu')

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
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
  useOverlayKeys(open, onClose, ref, 'dialog')

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
  const ref = useRef<HTMLDivElement>(null)
  useOverlayKeys(open, onClose, ref, 'dialog')

  if (!open) return null
  return (
    <div className="slop-overlay slop-overlay-sheet" onMouseDown={onClose}>
      <div
        ref={ref}
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

function useOverlayKeys(
  open: boolean,
  onClose: () => void,
  rootRef: RefObject<HTMLElement | null>,
  mode: 'dialog' | 'menu',
): void {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const root = rootRef.current
    if (!root) return
    const previously = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => {
      if (mode === 'dialog') focusDialog(root)
      else focusMenu(root)
    })

    const onKey = (event: KeyboardEvent) => {
      const current = rootRef.current
      if (!current) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (mode === 'dialog') {
        if (event.key === 'Enter') submitPrimary(current, event)
        if (event.key === 'Tab') trapTab(current, event)
        return
      }
      if (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        moveMenu(current, event)
      }
    }

    const onFocus = (event: FocusEvent) => {
      const current = rootRef.current
      if (!current) return
      if (event.target instanceof Node && current.contains(event.target)) return
      if (mode === 'dialog') focusDialog(current)
      else focusMenu(current)
    }

    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      if (previously?.isConnected) previously.focus()
    }
  }, [open, mode, rootRef])
}

function visible(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]')) return false
  const style = getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return el.getClientRects().length > 0
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.tabIndex >= 0 && visible(el))
}

function focusDialog(root: HTMLElement): void {
  const field = [...root.querySelectorAll<HTMLElement>('input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])')].find(visible)
  if (field) {
    field.focus()
    return
  }
  const primary = [...root.querySelectorAll<HTMLButtonElement>('button.slop-btn.primary:not(:disabled)')].filter(visible).at(-1)
  if (primary) {
    primary.focus()
    return
  }
  const rest = focusables(root).find((el) => !el.closest('.slop-dialog-bar'))
  ;(rest ?? focusables(root)[0])?.focus()
}

function submitPrimary(root: HTMLElement, event: KeyboardEvent): void {
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return
  const target = event.target
  if (!(target instanceof HTMLElement) || !root.contains(target)) return
  if (target.tagName === 'TEXTAREA' || target.isContentEditable) return
  if (target.closest('[role="menu"]')) return
  if (target.closest('button')) return
  const primary = [...root.querySelectorAll<HTMLButtonElement>('button.slop-btn.primary:not(:disabled)')].filter(visible).at(-1)
  if (!primary) return
  event.preventDefault()
  event.stopPropagation()
  primary.click()
}

function trapTab(root: HTMLElement, event: KeyboardEvent): void {
  const items = focusables(root)
  if (!items.length) {
    event.preventDefault()
    return
  }
  const current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const index = current ? items.indexOf(current) : -1
  const next = event.shiftKey
    ? items[(index <= 0 ? items.length : index) - 1]
    : items[index < 0 || index === items.length - 1 ? 0 : index + 1]
  event.preventDefault()
  event.stopPropagation()
  next?.focus()
}

function menuItems(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')].filter(visible)
}

function focusMenu(root: HTMLElement): void {
  menuItems(root)[0]?.focus()
}

function moveMenu(root: HTMLElement, event: KeyboardEvent): void {
  const items = menuItems(root)
  if (!items.length) {
    event.preventDefault()
    return
  }
  const current = document.activeElement
  const index = current instanceof HTMLButtonElement ? items.indexOf(current) : -1
  let next = 0
  if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length
  else if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = items.length - 1
  else if (event.key === 'Tab') next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : index < 0 || index === items.length - 1 ? 0 : index + 1
  else return
  event.preventDefault()
  event.stopPropagation()
  items[next]?.focus()
}
