import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { applyTheme, type ThemeMode } from '../../web/src/design/theme'
import { onHostMessage, send } from './host'

export type TitleScope = 'app' | 'screen'

export const TitleScopeContext = createContext<TitleScope>('app')

export type SlopContextValue = {
  mode: ThemeMode
  accent: string
  focused: boolean
  title: string
  setTitle: (title: string, scope?: TitleScope) => void
  releaseScreenTitle: () => void
}

export const SlopContext = createContext<SlopContextValue | null>(null)

export function SlopProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light')
  const [accent, setAccent] = useState('#e4532d')
  const [focused, setFocused] = useState(false)
  const [title, setTitleState] = useState('')
  const titleRef = useRef('')
  const appTitle = useRef('')
  const screenTitle = useRef<string | null>(null)

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

  const publish = useCallback((shown: string) => {
    if (titleRef.current === shown) return
    titleRef.current = shown
    // Apps call this during render. Defer so the provider does not update mid-render.
    queueMicrotask(() => {
      setTitleState(shown)
      send('setTitle', { title: shown })
    })
  }, [])

  const setTitle = useCallback((next: string, scope: TitleScope = 'app') => {
    if (scope === 'screen') screenTitle.current = next
    else appTitle.current = next
    publish(screenTitle.current ?? appTitle.current)
  }, [publish])

  const releaseScreenTitle = useCallback(() => {
    screenTitle.current = null
    publish(appTitle.current)
  }, [publish])

  const value = useMemo(
    () => ({ mode, accent, focused, title, setTitle, releaseScreenTitle }),
    [mode, accent, focused, title, setTitle, releaseScreenTitle],
  )

  return <SlopContext.Provider value={value}>{children}</SlopContext.Provider>
}

export function useSlopContext(): SlopContextValue {
  const ctx = useContext(SlopContext)
  if (!ctx) throw new Error('slopOS context is missing')
  return ctx
}

/** A pushed screen owns the window title until it unmounts. */
export function ScreenTitle({ children }: { children: ReactNode }) {
  const { releaseScreenTitle } = useSlopContext()
  useEffect(() => () => releaseScreenTitle(), [releaseScreenTitle])
  return <TitleScopeContext.Provider value="screen">{children}</TitleScopeContext.Provider>
}
