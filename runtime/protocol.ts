export const SLOP_PROTOCOL = 1 as const

export type SlopMessage = {
  slop: typeof SLOP_PROTOCOL
  type: string
  id?: string
  winId?: string
  payload?: unknown
}

/** What the person did on a screen, as the runtime hook read it off the DOM. */
export type Interaction = { action: 'click' | 'enter' | 'change' | 'submit'; label: string; value?: string }

/** A generated screen, persisted with its window and restored into the iframe. */
export type PersistedScreen = {
  id: string
  title: string
  viewId: string
  intent?: string
  context?: unknown
  /** Cache key of the interaction that produced this screen. */
  key?: string
  /** On the forward side of the history. */
  ahead?: boolean
}
