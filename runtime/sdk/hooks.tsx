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

/** Read another app’s storage. Never writes. `undefined` when the id or key is missing. */
export function useAppData<T>(appId: string, key: string): [T | undefined, { loaded: boolean }] {
  const [value, setValue] = useState<T | undefined>(undefined)
  const [loadedToken, setLoadedToken] = useState<string | null>(null)
  const token = `${appId}\0${key}`

  useEffect(() => {
    let cancel = false
    if (!appId || !key) {
      setValue(undefined)
      setLoadedToken(token)
      return
    }
    rpc<StorageReply>('storage.read', { appId, key })
      .then((reply) => {
        if (cancel) return
        setValue(reply.found === false ? undefined : (reply.value as T | undefined))
        setLoadedToken(token)
      })
      .catch(() => {
        if (!cancel) {
          setValue(undefined)
          setLoadedToken(token)
        }
      })
    return () => {
      cancel = true
    }
  }, [appId, key, token])

  return [value, { loaded: loadedToken === token }]
}

export function useStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void, { loaded: boolean }] {
  const [value, setValue] = useState<T>(initial)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const initialRef = useRef(initial)
  initialRef.current = initial
  const dirty = useRef(false)
  const queued = useRef(false)
  const pending = useRef<T>(initial)
  const timer = useRef<number | null>(null)

  const flush = useCallback((storageKey: string) => {
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    if (!queued.current) return
    queued.current = false
    void storage.set(storageKey, pending.current)
  }, [])

  useEffect(() => {
    let cancel = false
    dirty.current = false
    storage
      .get<T>(key)
      .then((stored) => {
        if (cancel) return
        if (!dirty.current) {
          const next = stored === undefined ? initialRef.current : stored
          pending.current = next
          setValue(next)
        }
        setLoadedKey(key)
      })
      .catch(() => {
        if (!cancel) setLoadedKey(key)
      })
    return () => {
      cancel = true
      flush(key)
    }
  }, [key, flush])

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next
        dirty.current = true
        queued.current = true
        pending.current = resolved
        if (timer.current != null) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          timer.current = null
          if (!queued.current) return
          queued.current = false
          void storage.set(key, resolved)
        }, 280)
        return resolved
      })
    },
    [key],
  )

  return [value, set, { loaded: loadedKey === key }]
}

export function notify(title: string, body?: string): void {
  send('notify', { title, body })
}

/** Focus an installed app, opening a window when none is open. Unknown ids do nothing. */
export function openApp(id: string): void {
  send('openApp', { appId: id })
}

export const clipboard = {
  async write(text: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }
    } catch {
      // The sandboxed frame often cannot touch the clipboard. The host can.
    }
    const reply = await rpc<{ error?: string }>('clipboard.write', { text })
    if (reply.error) throw new Error(reply.error)
  },
}

/** Ask the host to download a file. `data` is text, or a small Blob. */
export async function download(filename: string, data: string | Blob): Promise<void> {
  const name = filename.replace(/[/\\]/g, '').trim() || 'download'
  if (typeof data === 'string') {
    const reply = await rpc<{ error?: string }>('download', { filename: name, data, encoding: 'utf8', mime: 'text/plain;charset=utf-8' })
    if (reply.error) throw new Error(reply.error)
    return
  }
  const bytes = new Uint8Array(await data.arrayBuffer())
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  const reply = await rpc<{ error?: string }>('download', {
    filename: name,
    data: btoa(binary),
    encoding: 'base64',
    mime: data.type || 'application/octet-stream',
  })
  if (reply.error) throw new Error(reply.error)
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
      if (isTyping(event) && !parsed.mod && !parsed.alt && parsed.key !== 'escape') return
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
  const aliases: Record<string, string> = {
    space: ' ',
    esc: 'escape',
    return: 'enter',
    left: 'arrowleft',
    right: 'arrowright',
    up: 'arrowup',
    down: 'arrowdown',
  }
  return {
    mod: parts.some((part) => part === 'mod' || part === 'meta' || part === 'cmd' || part === 'ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: aliases[raw] ?? raw,
  }
}

function matchCombo(event: KeyboardEvent, combo: Combo): boolean {
  const mod = event.metaKey || event.ctrlKey
  if (combo.mod !== mod) return false
  if (combo.shift !== event.shiftKey) return false
  if (combo.alt !== event.altKey) return false
  return event.key.toLowerCase() === combo.key || event.code.toLowerCase() === combo.key
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}
