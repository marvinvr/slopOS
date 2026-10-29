import fs from 'node:fs/promises'
import path from 'node:path'
import type { PersistedScreen } from '../runtime/protocol'
import { settingsPath } from './paths'

export type SavedRect = { x: number; y: number; width: number; height: number }

export type SavedWindow = {
  id: string
  appId: string
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
  maximized: boolean
  z: number
  restore: SavedRect | null
  screens: PersistedScreen[]
}

export type Settings = {
  theme: 'light' | 'dark' | 'auto'
  accent: string
  wallpaper: string
  dockPins: string[]
  windows: SavedWindow[]
  focusedWindowId: string | null
}

const DEFAULTS: Settings = {
  theme: 'auto',
  accent: '#e4532d',
  wallpaper: 'mesh',
  dockPins: [],
  windows: [],
  focusedWindowId: null,
}

let chain: Promise<unknown> = Promise.resolve()

export function getSettings(): Promise<Settings> {
  return enqueue(async () => normalize(await readRaw()))
}

export function putSettings(patch: unknown): Promise<Settings> {
  return enqueue(async () => {
    const current = normalize(await readRaw())
    const next = normalize({ ...current, ...(isObject(patch) ? patch : {}) })
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    const tmp = `${settingsPath}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(next, null, 2))
    await fs.rename(tmp, settingsPath)
    return next
  })
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn)
  chain = next
  return next
}

async function readRaw(): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(settingsPath, 'utf8')) as unknown
  } catch {
    return {}
  }
}

function normalize(raw: unknown): Settings {
  const src = isObject(raw) ? raw : {}
  const theme = src.theme === 'light' || src.theme === 'dark' || src.theme === 'auto' ? src.theme : DEFAULTS.theme
  const accent = typeof src.accent === 'string' && src.accent.trim() ? src.accent : DEFAULTS.accent
  const wallpaper = typeof src.wallpaper === 'string' && src.wallpaper.trim() ? src.wallpaper : DEFAULTS.wallpaper
  const dockPins = Array.isArray(src.dockPins) ? src.dockPins.filter((id): id is string => typeof id === 'string') : []
  const windows = Array.isArray(src.windows) ? src.windows.map(normalizeWindow).filter((win): win is SavedWindow => win !== null) : []
  const focused = typeof src.focusedWindowId === 'string' ? src.focusedWindowId : null
  return { theme, accent, wallpaper, dockPins, windows, focusedWindowId: focused }
}

function normalizeWindow(raw: unknown): SavedWindow | null {
  if (!isObject(raw)) return null
  if (typeof raw.id !== 'string' || typeof raw.appId !== 'string') return null
  return {
    id: raw.id,
    appId: raw.appId,
    x: finite(raw.x, 80),
    y: finite(raw.y, 48),
    width: finite(raw.width, 640),
    height: finite(raw.height, 480),
    minimized: Boolean(raw.minimized),
    maximized: Boolean(raw.maximized),
    z: finite(raw.z, 1),
    restore: normalizeRect(raw.restore),
    screens: normalizeScreens(raw.screens),
  }
}

function normalizeScreens(raw: unknown): PersistedScreen[] {
  if (!Array.isArray(raw)) return []
  const screens: PersistedScreen[] = []
  for (const item of raw) {
    if (!isObject(item) || typeof item.id !== 'string' || typeof item.viewId !== 'string' || !item.viewId) continue
    screens.push({
      id: item.id,
      title: typeof item.title === 'string' && item.title ? item.title : 'Page',
      viewId: item.viewId,
      intent: typeof item.intent === 'string' ? item.intent : undefined,
      params: item.params,
      context: item.context,
    })
    if (screens.length >= 24) break
  }
  return screens
}

function normalizeRect(raw: unknown): SavedRect | null {
  if (!isObject(raw)) return null
  return { x: finite(raw.x, 80), y: finite(raw.y, 48), width: finite(raw.width, 640), height: finite(raw.height, 480) }
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
