import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Kbd } from '../../design/kit'
import { cx } from '../../design/kit/cx'
import { pushLayer } from '../layers'

export type MenuNode =
  | {
      type: 'item'
      label: string
      shortcut?: string
      disabled?: boolean
      checked?: boolean
      danger?: boolean
      onSelect: () => void
    }
  | { type: 'sep' }
  | { type: 'sub'; label: string; items: MenuNode[] }
  | {
      type: 'swatches'
      label: string
      shape?: 'dot' | 'preview'
      options: { value: string; color: string; label: string }[]
      value: string
      onSelect: (value: string) => void
    }

type Props = {
  items: MenuNode[]
  onClose: () => void
  /** ArrowLeft: previous menu, or close this submenu. */
  onExitLeft?: () => void
  /** ArrowRight when the row is not a submenu. */
  onExitRight?: () => void
  /** Escape inside a submenu closes only the submenu. */
  onDismissSub?: () => void
}

function canHighlight(item: MenuNode | undefined): boolean {
  if (!item || item.type === 'sep') return false
  if (item.type === 'item' && item.disabled) return false
  return true
}

function nextEnabled(items: MenuNode[], from: number, delta: number): number {
  const count = items.length
  if (!count) return -1
  for (let step = 1; step <= count; step++) {
    const index = (from + delta * step + count * 4) % count
    if (canHighlight(items[index])) return index
  }
  return -1
}

export function MenuList({ items, onClose, onExitLeft, onExitRight, onDismissSub }: Props) {
  const [index, setIndex] = useState(() => nextEnabled(items, -1, 1))
  const [subOpen, setSubOpen] = useState(false)
  const itemsRef = useRef(items)
  const indexRef = useRef(index)
  const subRef = useRef(subOpen)
  const cb = useRef({ onClose, onExitLeft, onExitRight, onDismissSub })
  itemsRef.current = items
  indexRef.current = index
  subRef.current = subOpen
  cb.current = { onClose, onExitLeft, onExitRight, onDismissSub }

  useEffect(() => {
    setIndex((current) => {
      const list = itemsRef.current
      if (current >= 0 && current < list.length && canHighlight(list[current])) return current
      return nextEnabled(list, -1, 1)
    })
  }, [items])

  useEffect(() => {
    if (subOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea')) return
      const list = itemsRef.current
      const current = indexRef.current
      const item = list[current]
      if (event.key === 'Escape' && cb.current.onDismissSub) {
        event.preventDefault()
        event.stopImmediatePropagation()
        cb.current.onDismissSub()
        return
      }
      if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const next = nextEnabled(list, current, 1)
        if (next >= 0) setIndex(next)
        setSubOpen(false)
        return
      }
      if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const next = nextEnabled(list, current < 0 ? list.length : current, -1)
        if (next >= 0) setIndex(next)
        setSubOpen(false)
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (item?.type === 'swatches') {
          nudgeSwatch(item, 1)
          return
        }
        if (item?.type === 'sub') {
          setSubOpen(true)
          return
        }
        cb.current.onExitRight?.()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (item?.type === 'swatches') {
          nudgeSwatch(item, -1)
          return
        }
        cb.current.onExitLeft?.()
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        if (!item || item.type === 'sep' || item.type === 'swatches') return
        event.preventDefault()
        event.stopImmediatePropagation()
        if (item.type === 'sub') {
          setSubOpen(true)
          return
        }
        if (item.disabled) return
        item.onSelect()
        cb.current.onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [subOpen])

  return (
    <div className="shell-menu-list" role="menu">
      {items.map((item, itemIndex) => {
        if (item.type === 'sep') return <div key={itemIndex} className="shell-menu-sep" role="separator" />
        const active = itemIndex === index
        if (item.type === 'swatches') {
          return (
            <div
              key={item.label}
              role="group"
              aria-label={item.label}
              className={cx('shell-menu-item', 'is-swatches', active && 'is-active')}
              onMouseEnter={() => {
                setIndex(itemIndex)
                setSubOpen(false)
              }}
            >
              <span className="shell-menu-check" />
              <span className="shell-swatch-label">{item.label}</span>
              <span className="shell-swatches">
                {item.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cx('shell-swatch', item.shape === 'preview' && 'is-preview', option.value === item.value && 'is-selected')}
                    style={{ background: option.color }}
                    aria-label={option.label}
                    aria-pressed={option.value === item.value}
                    title={option.label}
                    onClick={() => item.onSelect(option.value)}
                  />
                ))}
              </span>
            </div>
          )
        }
        if (item.type === 'sub') {
          return (
            <div
              key={item.label}
              className="shell-menu-sub"
              onMouseEnter={() => {
                setIndex(itemIndex)
                setSubOpen(true)
              }}
            >
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={active && subOpen}
                className={cx('shell-menu-item', active && 'is-active')}
                onClick={() => setSubOpen(true)}
              >
                <span className="shell-menu-check" />
                <span className="shell-menu-label-text">{item.label}</span>
                <span className="shell-menu-shortcut" aria-hidden>
                  <Chevron />
                </span>
              </button>
              {active && subOpen ? (
                <div className="shell-submenu">
                  <div className="shell-menu-pop" role="presentation">
                    <MenuList items={item.items} onClose={onClose} onExitLeft={() => setSubOpen(false)} onDismissSub={() => setSubOpen(false)} />
                  </div>
                </div>
              ) : null}
            </div>
          )
        }
        return (
          <button
            key={`${item.label}-${itemIndex}`}
            type="button"
            role="menuitem"
            aria-checked={item.checked || undefined}
            disabled={item.disabled}
            className={cx('shell-menu-item', active && 'is-active', item.danger && 'is-danger')}
            onMouseEnter={() => {
              if (item.disabled) return
              setIndex(itemIndex)
              setSubOpen(false)
            }}
            onClick={() => {
              if (item.disabled) return
              item.onSelect()
              onClose()
            }}
          >
            <span className="shell-menu-check">{item.checked ? <Check /> : null}</span>
            <span className="shell-menu-label-text">{item.label}</span>
            {item.shortcut ? (
              <span className="shell-menu-shortcut">
                <Kbd>{item.shortcut}</Kbd>
              </span>
            ) : (
              <span className="shell-menu-shortcut" />
            )}
          </button>
        )
      })}
    </div>
  )
}

function nudgeSwatch(item: Extract<MenuNode, { type: 'swatches' }>, delta: number): void {
  const values = item.options.map((option) => option.value)
  if (!values.length) return
  const current = Math.max(0, values.indexOf(item.value))
  const next = values[(current + delta + values.length) % values.length]
  if (next) item.onSelect(next)
}

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2.2 6.3 L4.7 8.7 L9.8 3.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M3.4 1.6 L6.8 5 L3.4 8.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type ContextProps = { x: number; y: number; items: MenuNode[]; onClose: () => void }

export function ContextMenu({ x, y, items, onClose }: ContextProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => pushLayer(() => closeRef.current()), [])

  useEffect(() => {
    ref.current?.focus()
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let left = x
    let top = y
    if (left + rect.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - rect.width - 8)
    if (top + rect.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - rect.height - 8)
    setPos({ x: left, y: top })
  }, [x, y])

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', onPointer, true)
    return () => window.removeEventListener('pointerdown', onPointer, true)
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className="shell-menu-pop is-context"
      style={{ left: pos.x, top: pos.y }}
      role="presentation"
      tabIndex={-1}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuList items={items} onClose={onClose} />
    </div>,
    document.body,
  )
}
