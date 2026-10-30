import { useSyncExternalStore } from 'react'
import type { Interaction, PersistedScreen } from '../../../../runtime/protocol'
import { randomUUID } from '../../../../runtime/uuid'
import { requestScreen } from '../bridge/gen'
import { useShell, type Win } from '../store'

/**
 * Each window's screens: a back stack and a forward list in `win.screens` (persisted),
 * plus the one screen it is waiting for (not persisted).
 */
export type Pending = {
  token: string
  title: string
  intent: string
  context: unknown
  key: string
  /** Reload: the result takes the place of the current screen. */
  replace?: boolean
  failed?: boolean
}

const pending = new Map<string, Pending>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function setPending(winId: string, next: Pending | null): void {
  if (next) pending.set(winId, next)
  else pending.delete(winId)
  emit()
}

export function usePending(winId: string): Pending | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => pending.get(winId),
  )
}

export function currentScreen(win: Win): PersistedScreen | undefined {
  return win.screens.filter((screen) => !screen.ahead).at(-1)
}

export function canGoForward(win: Win): boolean {
  return win.screens.some((screen) => screen.ahead)
}

function windowOf(winId: string): Win | undefined {
  return useShell.getState().windows.find((win) => win.id === winId)
}

/** Something happened on the current screen: ask for the one that follows it. */
export function interact(winId: string, interaction: Interaction, values: { field: string; value: string }[] = [], shown = '', extra?: Record<string, unknown>): void {
  const win = windowOf(winId)
  if (!win) return
  const busy = pending.get(winId)
  if (busy && !busy.failed) return
  const top = currentScreen(win)
  const from = top?.viewId || 'root'
  const app = useShell.getState().apps.find((item) => item.id === win.appId)
  const context = { ...extra, from, title: top?.title || app?.name || win.title, interaction, values: values.slice(0, 20), shown: clip(shown, 2500) }
  load(winId, {
    token: randomUUID(),
    title: interaction.label || 'Page',
    intent: describe(interaction),
    context,
    key: `${win.appId}:${from}:${hash(JSON.stringify([interaction, context.values]))}`,
  })
}

function load(winId: string, next: Pending, fresh = false): void {
  const win = windowOf(winId)
  if (!win) return
  setPending(winId, next)
  requestScreen(win, { intent: next.intent, context: next.context, key: next.key, fresh })
    .then((result) => {
      if (pending.get(winId)?.token !== next.token) return
      const current = windowOf(winId)
      if (!current) return setPending(winId, null)
      const back = current.screens.filter((screen) => !screen.ahead)
      const ahead = current.screens.filter((screen) => screen.ahead)
      const screen: PersistedScreen = {
        id: randomUUID(),
        title: result.title || next.title,
        viewId: result.viewId,
        intent: next.intent,
        context: slim(next.context),
        key: next.key,
      }
      const screens = next.replace ? [...back.slice(0, -1), screen, ...ahead] : [...back, screen]
      useShell.getState().setWindowScreens(winId, screens.slice(-24))
      setPending(winId, null)
    })
    .catch((err: unknown) => {
      if (err instanceof Error) console.warn(err.message)
      if (pending.get(winId)?.token === next.token) setPending(winId, { ...next, failed: true })
    })
}

export function goBack(winId: string): void {
  if (pending.has(winId)) return setPending(winId, null)
  const win = windowOf(winId)
  const back = win?.screens.filter((screen) => !screen.ahead) ?? []
  const last = back.at(-1)
  if (!win || !last) return
  const ahead = win.screens.filter((screen) => screen.ahead)
  useShell.getState().setWindowScreens(winId, [...back.slice(0, -1), { ...last, ahead: true }, ...ahead])
}

export function goForward(winId: string): void {
  const win = windowOf(winId)
  if (!win || pending.has(winId)) return
  const back = win.screens.filter((screen) => !screen.ahead)
  const [next, ...rest] = win.screens.filter((screen) => screen.ahead)
  if (!next) return
  useShell.getState().setWindowScreens(winId, [...back, { ...next, ahead: undefined }, ...rest])
}

/** Generate the current screen again from the same interaction. */
export function reloadScreen(winId: string): void {
  const win = windowOf(winId)
  const top = win ? currentScreen(win) : undefined
  if (!top?.intent || !top.key || pending.has(winId)) return
  load(winId, { token: randomUUID(), title: top.title, intent: top.intent, context: top.context, key: top.key, replace: true }, true)
}

export function retryScreen(winId: string): void {
  const failed = pending.get(winId)
  if (!failed?.failed) return
  load(winId, { ...failed, token: randomUUID(), failed: undefined }, true)
}

/** Show a screen that already exists (Spotlight › Places). */
export function showScreen(winId: string, viewId: string, title: string, intent?: string): void {
  const win = windowOf(winId)
  if (!win || currentScreen(win)?.viewId === viewId) return
  setPending(winId, null)
  const back = win.screens.filter((screen) => !screen.ahead)
  useShell.getState().setWindowScreens(winId, [...back, { id: randomUUID(), title, viewId, intent }].slice(-24))
}

export function clearScreens(winId: string): void {
  setPending(winId, null)
  useShell.getState().setWindowScreens(winId, [])
}

function describe(interaction: Interaction): string {
  if (interaction.action === 'enter') return `Typed “${interaction.value}” in ${interaction.label} and pressed Enter`
  if (interaction.action === 'change') return `Set ${interaction.label} to ${interaction.value}`
  if (interaction.action === 'submit') return `Submitted ${interaction.label}`
  return `Clicked “${interaction.label}”`
}

/** Saved screens keep enough context to reload, not the whole page text. */
function slim(context: unknown): unknown {
  if (!context || typeof context !== 'object' || !('shown' in context)) return context
  const shown = (context as { shown?: unknown }).shown
  return { ...context, shown: typeof shown === 'string' ? clip(shown, 1200) : shown }
}

function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trim()}…`
}

function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return h.toString(36)
}
