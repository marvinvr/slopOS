import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { MenuSpec, WireMenu } from '../protocol'
import { onHostMessage, rpc, send } from './host'
import { SlopContext } from './context'

export function useWindow() {
  const ctx = useContext(SlopContext)
  if (!ctx) throw new Error('useWindow must be used inside an app')
  return {
    title: ctx.title,
    setTitle: ctx.setTitle,
    setSize: (width: number, height: number) => send('setSize', { width, height }),
    close: () => send('close'),
    focused: ctx.focused,
  }
}

export function useTheme() {
  const ctx = useContext(SlopContext)
  if (!ctx) throw new Error('useTheme must be used inside an app')
  return { mode: ctx.mode, accent: ctx.accent }
}

type StorageReply = { found?: boolean; value?: unknown }

export const storage = {
  async get<T>(key: string): Promise<T | undefined> {
    const reply = await rpc<StorageReply>('storage.get', { key })
    if (reply.found === false) return undefined
    return reply.value as T | undefined
  },
  async set(key: string, value: unknown): Promise<void> {
    await rpc('storage.set', { key, value })
  },
  async remove(key: string): Promise<void> {
    await rpc('storage.remove', { key })
  },
  async keys(): Promise<string[]> {
    const reply = await rpc<{ keys: string[] }>('storage.keys')
    return reply.keys ?? []
  },
}

export function useStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void, { loaded: boolean }] {
  const [value, setValue] = useState<T>(initial)
  const [loaded, setLoaded] = useState(false)
  const initialRef = useRef(initial)
  initialRef.current = initial

  useEffect(() => {
    let cancel = false
    setLoaded(false)
    storage
      .get<T>(key)
      .then((stored) => {
        if (cancel) return
        setValue(stored === undefined ? initialRef.current : stored)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancel) setLoaded(true)
      })
    return () => {
      cancel = true
    }
  }, [key])

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next
        void storage.set(key, resolved)
        return resolved
      })
    },
    [key],
  )

  return [value, set, { loaded }]
}

export function notify(title: string, body?: string): void {
  send('notify', { title, body })
}

type FetchReply = { status: number; headers?: Record<string, string>; body?: string; error?: string }

export async function slopFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'POST') throw new Error('slopFetch only supports GET and POST')
  let body: string | undefined
  if (init?.body != null) {
    if (typeof init.body === 'string') body = init.body
    else if (init.body instanceof URLSearchParams) body = init.body.toString()
    else throw new Error('slopFetch only supports string bodies')
  }
  const headers: Record<string, string> = {}
  if (init?.headers) new Headers(init.headers).forEach((value, key) => { headers[key] = value })
  const reply = await rpc<FetchReply>('fetch', { url, method, headers, body })
  if (reply.error) throw new Error(reply.error)
  return new Response(reply.body ?? '', { status: reply.status ?? 500, headers: reply.headers })
}

const menuHandlers = new Map<string, () => void>()
let menuListenerReady = false

function ensureMenuListener(): void {
  if (menuListenerReady) return
  menuListenerReady = true
  onHostMessage((msg) => {
    if (msg.type !== 'menu.invoke') return
    const id = (msg.payload as { id?: string } | undefined)?.id
    if (id) menuHandlers.get(id)?.()
  })
}

export function useMenu(menus: MenuSpec[]): void {
  const latest = useRef(menus)
  latest.current = menus
  ensureMenuListener()
  const signature = menuSignature(menus)

  useEffect(() => {
    menuHandlers.clear()
    const wire = toWire(latest.current)
    send('menu.set', { menus: wire })
    return () => {
      menuHandlers.clear()
      send('menu.set', { menus: [] })
    }
  }, [signature])
}

function menuSignature(menus: MenuSpec[]): string {
  return JSON.stringify(
    menus.map((menu) => ({
      label: menu.label,
      items: menu.items.map((item) =>
        item === 'separator' ? 'separator' : { label: item.label, shortcut: item.shortcut, disabled: item.disabled },
      ),
    })),
  )
}

function toWire(menus: MenuSpec[]): WireMenu[] {
  return menus.map((menu, menuIndex) => ({
    label: menu.label,
    items: menu.items.map((item, itemIndex) => {
      const id = `m${menuIndex}i${itemIndex}`
      if (item === 'separator') return { type: 'separator' as const, id }
      menuHandlers.set(id, item.onSelect)
      return {
        type: 'item' as const,
        id,
        label: item.label,
        shortcut: item.shortcut,
        disabled: item.disabled,
      }
    }),
  }))
}

export function useInterval(fn: () => void, ms: number | null): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (ms == null) return
    const timer = window.setInterval(() => ref.current(), ms)
    return () => window.clearInterval(timer)
  }, [ms])
}

type Combo = { mod: boolean; shift: boolean; alt: boolean; key: string }

export function useHotkey(combo: string, fn: () => void): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const parsed = parseCombo(combo)
    const onKey = (event: KeyboardEvent) => {
      if (!matchCombo(event, parsed)) return
      event.preventDefault()
      ref.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [combo])
}

function parseCombo(combo: string): Combo {
  const parts = combo.toLowerCase().split('+').map((part) => part.trim()).filter(Boolean)
  const raw = parts.filter((part) => part !== 'mod' && part !== 'meta' && part !== 'cmd' && part !== 'ctrl' && part !== 'shift' && part !== 'alt')[0] ?? ''
  return {
    mod: parts.some((part) => part === 'mod' || part === 'meta' || part === 'cmd' || part === 'ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: raw === 'space' ? ' ' : raw,
  }
}

function matchCombo(event: KeyboardEvent, combo: Combo): boolean {
  const mod = event.metaKey || event.ctrlKey
  if (combo.mod !== mod) return false
  if (combo.shift !== event.shiftKey) return false
  if (combo.alt !== event.altKey) return false
  return event.key.toLowerCase() === combo.key
}
