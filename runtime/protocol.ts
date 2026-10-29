export const SLOP_PROTOCOL = 1 as const

export type SlopMessage = {
  slop: typeof SLOP_PROTOCOL
  type: string
  id?: string
  winId?: string
  payload?: unknown
}

export type WireMenuItem =
  | { type: 'item'; id: string; label: string; shortcut?: string; disabled?: boolean }
  | { type: 'separator'; id: string }

export type WireMenu = { label: string; items: WireMenuItem[] }

export type MenuItem =
  | {
      label: string
      shortcut?: string
      disabled?: boolean
      onSelect: () => void
    }
  | 'separator'

export type MenuSpec = { label: string; items: MenuItem[] }

/** A generated screen, persisted with its window and restored into the iframe. */
export type PersistedScreen = {
  id: string
  title: string
  viewId: string
  intent?: string
  params?: unknown
  context?: unknown
}
