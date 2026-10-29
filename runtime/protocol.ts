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
