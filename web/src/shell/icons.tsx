import { Icon } from '../design/kit'
import { tintFor } from './tint'

/** A small drip-shaped mark. One path, used in the menu bar and About. */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path
        fill="currentColor"
        d="M16.2 3.2c2.4 2.6 6.6 7.4 7.8 12.2 1.3 5.2-.4 10.4-4.6 13-3.6 2.2-8.4 2-11.6-.6-3.4-2.8-4.8-7.6-3.8-12.2C5.2 10.2 9.6 5.4 16.2 3.2z"
      />
    </svg>
  )
}

/** Dock launcher: four soft squares, not a stock icon. */
export function DrawerGlyph() {
  return (
    <svg className="shell-launcher" width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <rect x="1" y="1" width="7.5" height="7.5" rx="2.2" />
      <rect x="11.5" y="1" width="7.5" height="7.5" rx="2.2" />
      <rect x="1" y="11.5" width="7.5" height="7.5" rx="2.2" />
      <rect x="11.5" y="11.5" width="7.5" height="7.5" rx="2.2" />
    </svg>
  )
}

export function AppTile({ id, icon, tint, size = 46, className }: { id: string; icon: string; tint?: string; size?: number; className?: string }) {
  return (
    <span
      className={className ? `shell-tile ${className}` : 'shell-tile'}
      style={{ width: size, height: size, backgroundColor: tintFor(id, tint), borderRadius: Math.round(size * 0.28) }}
    >
      <Icon name={icon} size={Math.round(size * 0.46)} strokeWidth={1.75} />
    </span>
  )
}
