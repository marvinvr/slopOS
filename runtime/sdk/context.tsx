import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { applyTheme, type ThemeMode } from '../../web/src/design/theme'
import { onHostMessage, send } from './host'

export type SlopContextValue = {
  mode: ThemeMode
  accent: string
  focused: boolean
  title: string
  setTitle: (title: string) => void
}

export const SlopContext = createContext<SlopContextValue | null>(null)

export function SlopProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light')
  const [accent, setAccent] = useState('#e4532d')
  const [focused, setFocused] = useState(false)
  const [title, setTitleState] = useState('')
  const titleRef = useRef('')

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type === 'theme') {
        const payload = msg.payload as { mode?: ThemeMode; accent?: string }
        const nextMode = payload.mode === 'dark' ? 'dark' : 'light'
        const nextAccent = payload.accent || '#e4532d'
        setMode(nextMode)
        setAccent(nextAccent)
        applyTheme(nextMode, nextAccent)
      } else if (msg.type === 'focus') {
        setFocused(Boolean((msg.payload as { focused?: boolean } | undefined)?.focused))
      }
    })
  }, [])

  const setTitle = useCallback((next: string) => {
    if (titleRef.current === next) return
    titleRef.current = next
    setTitleState(next)
    send('setTitle', { title: next })
  }, [])

  const value = useMemo(
    () => ({ mode, accent, focused, title, setTitle }),
    [mode, accent, focused, title, setTitle],
  )

  return <SlopContext.Provider value={value}>{children}</SlopContext.Provider>
}

export function useSlopContext(): SlopContextValue {
  const ctx = useContext(SlopContext)
  if (!ctx) throw new Error('slopOS context is missing')
  return ctx
}
