import { Icon } from '../design/kit'
import { tintFor } from './tint'

/** A small drip-shaped mark. One path, used in the menu bar, welcome, and About. */
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

export function AppTile({ id, icon, tint, size = 46 }: { id: string; icon: string; tint?: string; size?: number }) {
  return (
    <span className="shell-tile" style={{ width: size, height: size, background: tintFor(id, tint), borderRadius: size > 46 ? 14 : 12 }}>
      <Icon name={icon} size={Math.round(size * 0.48)} strokeWidth={1.75} />
    </span>
  )
}
