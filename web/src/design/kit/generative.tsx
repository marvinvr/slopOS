import { createContext, useContext, type ReactNode } from 'react'

/** Provided by the app runtime. The shell has no provider, so controls stay ordinary. */
export type GenerativeApi = {
  open: (intent: string) => void
  busy: string | null
}

const GenerativeContext = createContext<GenerativeApi | null>(null)

export function GenerativeProvider({ api, children }: { api: GenerativeApi; children: ReactNode }) {
  return <GenerativeContext.Provider value={api}>{children}</GenerativeContext.Provider>
}

export function useGenerativeApi(): GenerativeApi | null {
  return useContext(GenerativeContext)
}

/** Visible string children, so a handler-less button can name its own intent. */
export function visibleText(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children).trim()
  if (Array.isArray(children)) return children.map((child) => visibleText(child)).filter(Boolean).join(' ').trim()
  return ''
}

/**
 * No handler + a runtime provider = generative.
 * `eligible: false` keeps a surface inert (a Card with neither onClick nor intent).
 */
export function useGenerative(opts: {
  onClick?: () => void
  disabled?: boolean
  intent?: string
  label: string
  eligible?: boolean
}): { onClick?: () => void; generative: boolean; busy: boolean } {
  const api = useContext(GenerativeContext)
  if (opts.onClick || opts.disabled || opts.eligible === false || !api) {
    return { onClick: opts.onClick, generative: false, busy: false }
  }
  const intent = (opts.intent?.trim() || opts.label.trim() || 'Open')
  return {
    generative: true,
    busy: api.busy === intent,
    onClick: () => api.open(intent),
  }
}
