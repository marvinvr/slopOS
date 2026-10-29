import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '../../design/kit/cx'

export type BarMenuItem =
  | { label: string; shortcut?: string; disabled?: boolean; checked?: boolean; onSelect?: () => void }
  | 'separator'

type Props = {
  menuId: string
  label: ReactNode
  items: BarMenuItem[]
  open: boolean
  anyOpen: boolean
  onOpen: (id: string) => void
  onClose: () => void
}

export function MenuBarMenu({ menuId, label, items, open, anyOpen, onOpen, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div ref={ref} className={cx('shell-menu', open && 'is-open')} onMouseEnter={() => anyOpen && onOpen(menuId)}>
      <button
        type="button"
        className="shell-menu-label"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? onClose() : onOpen(menuId))}
      >
        {label}
      </button>
      {open ? (
        <div role="menu" className="shell-menu-pop">
          {items.map((item, index) =>
            item === 'separator' ? (
              <div key={index} className="shell-menu-sep" role="separator" />
            ) : (
              <button
                key={`${item.label}-${index}`}
                type="button"
                role="menuitem"
                className="shell-menu-item"
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect?.()
                  onClose()
                }}
              >
                <span className="shell-menu-check">{item.checked ? '✓' : ''}</span>
                <span>{item.label}</span>
                {item.shortcut ? <span className="shell-menu-shortcut">{item.shortcut}</span> : <span />}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}
