import { useEffect } from 'react'
import { Button } from '../../design/kit'
import { pushLayer } from '../layers'
import { useShell } from '../store'

const SHORTCUTS: { label: string; keys: string }[] = [
  { label: 'Spotlight', keys: 'Ctrl+Space' },
  { label: 'Spotlight', keys: 'Ctrl+K' },
  { label: 'Close window', keys: 'Ctrl+W' },
  { label: 'Minimize', keys: 'Ctrl+M' },
  { label: 'Cycle windows', keys: 'Ctrl+`' },
  { label: 'Show all apps', keys: 'Ctrl+Shift+A' },
  { label: 'Full screen', keys: 'Ctrl+Shift+F' },
  { label: 'Keyboard shortcuts', keys: 'Ctrl+/' },
  { label: 'Dismiss', keys: 'Esc' },
]

export function ShortcutsDialog() {
  const open = useShell((state) => state.shortcutsOpen)
  const close = useShell((state) => state.setShortcutsOpen)

  useEffect(() => {
    if (!open) return
    return pushLayer(() => close(false))
  }, [open, close])

  if (!open) return null
  return (
    <div className="shell-about-backdrop" onPointerDown={() => close(false)}>
      <div
        className="shell-about shell-shortcuts"
        role="dialog"
        aria-modal="true"
        aria-labelledby="slop-keys-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h1 id="slop-keys-title">Keyboard Shortcuts</h1>
        <p className="line">Ctrl is the one that always arrives. On a Mac, ⌘ does the same where the browser allows it.</p>
        <ul className="shell-key-list">
          {SHORTCUTS.map((item) => (
            <li key={`${item.label}-${item.keys}`}>
              <span>{item.label}</span>
              <kbd>{item.keys}</kbd>
            </li>
          ))}
        </ul>
        <div className="shell-shortcuts-done">
          <Button variant="primary" onClick={() => close(false)}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
