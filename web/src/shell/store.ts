import { nanoid } from 'nanoid'
import { create } from 'zustand'
import type { PersistedScreen, WireMenu } from '../../../runtime/protocol'
import { MENU_H, workArea } from './metrics'
import { resolveTheme, type ThemeMode } from '../design/theme'
import type { AppManifest, Rect, ThemeSetting } from './types'

export type WinPhase = 'open' | 'minimizing' | 'minimized' | 'closing'

export type Win = {
  id: string
  appId: string
  title: string
  x: number
  y: number
  width: number
  height: number
  minWidth: number
  minHeight: number
  resizable: boolean
  maximized: boolean
  restore: Rect | null
  z: number
  phase: WinPhase
  version: number
  screens: PersistedScreen[]
}

export type Toast = { id: string; title: string; body?: string }
export type WindowError = { message: string; stack?: string }

type SettingsPayload = {
  theme?: ThemeSetting
  accent?: string
  wallpaper?: string
  dockPins?: string[]
  windows?: Array<Rect & { id: string; appId: string; minimized?: boolean; maximized?: boolean; z?: number; restore?: Rect | null; screens?: PersistedScreen[] }>
  focusedWindowId?: string | null
}

type State = {
  apps: AppManifest[]
  windows: Win[]
  focusedWindowId: string | null
  theme: ThemeSetting
  resolved: ThemeMode
  accent: string
  wallpaper: string
  dockPins: string[]
  toasts: Toast[]
  appMenus: Record<string, WireMenu[]>
  windowErrors: Record<string, WindowError>
  aboutOpen: boolean
  drawerOpen: boolean
  spotlightOpen: boolean
  interacting: boolean
  loaded: boolean
  zCounter: number
}

type Actions = {
  hydrate: (apps: AppManifest[], settings: SettingsPayload) => void
  refreshApps: () => Promise<void>
  openApp: (appId: string) => void
  newWindow: (appId: string) => void
  focusWindow: (id: string) => void
  closeWindow: (id: string) => void
  removeWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  commitMinimized: (id: string) => void
  toggleMaximize: (id: string) => void
  setGeometry: (id: string, geometry: Partial<Rect>) => void
  refitMaximized: () => void
  setTitle: (id: string, title: string) => void
  setMenus: (id: string, menus: WireMenu[]) => void
  setWindowScreens: (id: string, screens: PersistedScreen[]) => void
  setWindowError: (id: string, error: WindowError | null) => void
  pushToast: (title: string, body?: string) => void
  dismissToast: (id: string) => void
  setTheme: (theme: ThemeSetting) => void
  setAccent: (accent: string) => void
  setAboutOpen: (open: boolean) => void
  setDrawerOpen: (open: boolean) => void
  setSpotlightOpen: (open: boolean) => void
  setInteracting: (interacting: boolean) => void
  cycleWindows: () => void
}

export const useShell = create<State & Actions>((set, get) => ({
  apps: [],
  windows: [],
  focusedWindowId: null,
  theme: 'auto',
  resolved: resolveTheme('auto'),
  accent: '#e4532d',
  wallpaper: 'mesh',
  dockPins: [],
  toasts: [],
  appMenus: {},
  windowErrors: {},
  aboutOpen: false,
  drawerOpen: false,
  spotlightOpen: false,
  interacting: false,
  loaded: false,
  zCounter: 1,

  hydrate: (apps, settings) => {
    const windows = (settings.windows ?? [])
      .filter((saved) => apps.some((app) => app.id === saved.appId))
      .map((saved) => {
        const app = apps.find((item) => item.id === saved.appId)!
        return windowFromSaved(saved, app)
      })
    const zCounter = windows.reduce((max, win) => Math.max(max, win.z), 1)
    const focused = windows.some((win) => win.id === settings.focusedWindowId) ? settings.focusedWindowId ?? null : windows.find((win) => win.phase === 'open')?.id ?? null
    set({
      apps,
      windows,
      focusedWindowId: focused,
      theme: settings.theme ?? 'auto',
      accent: settings.accent || '#e4532d',
      wallpaper: settings.wallpaper || 'mesh',
      dockPins: settings.dockPins ?? [],
      zCounter,
      loaded: true,
    })
  },

  refreshApps: async () => {
    const res = await fetch('/api/apps')
    if (!res.ok) return
    const apps = (await res.json()) as AppManifest[]
    set({ apps })
  },

  openApp: (appId) => {
    const { windows } = get()
    const existing = windows.filter((win) => win.appId === appId && win.phase !== 'closing')
    if (!existing.length) {
      get().newWindow(appId)
      return
    }
    const top = [...existing].sort((a, b) => b.z - a.z)[0]
    get().focusWindow(top.id)
  },

  newWindow: (appId) => {
    const app = get().apps.find((item) => item.id === appId)
    if (!app) return
    const area = workArea()
    const offset = (get().windows.length % 8) * 26
    const width = clamp(app.window.width, app.window.minWidth, area.width)
    const height = clamp(app.window.height, app.window.minHeight, area.height)
    const x = clamp(Math.round((window.innerWidth - width) / 2 - 36 + offset), 16, Math.max(16, window.innerWidth - width - 16))
    const y = Math.max(area.y, area.y + 12 + (offset % 120))
    const z = get().zCounter + 1
    const win: Win = {
      id: nanoid(10),
      appId,
      title: app.name,
      x,
      y: Math.min(y, Math.max(MENU_H, window.innerHeight - 80)),
      width,
      height,
      minWidth: app.window.minWidth,
      minHeight: app.window.minHeight,
      resizable: app.window.resizable,
      maximized: false,
      restore: null,
      z,
      phase: 'open',
      version: app.version,
      screens: [],
    }
    set((state) => ({ windows: [...state.windows, win], focusedWindowId: win.id, zCounter: z, drawerOpen: false, spotlightOpen: false }))
    scheduleSave()
  },

  focusWindow: (id) => {
    const z = get().zCounter + 1
    set((state) => ({
      zCounter: z,
      focusedWindowId: id,
      windows: state.windows.map((win) => (win.id === id ? { ...win, z, phase: win.phase === 'closing' ? win.phase : 'open' } : win)),
    }))
    scheduleSave()
  },

  closeWindow: (id) => {
    set((state) => ({
      windows: state.windows.map((win) => (win.id === id ? { ...win, phase: 'closing' } : win)),
    }))
  },

  removeWindow: (id) => {
    set((state) => {
      const windows = state.windows.filter((win) => win.id !== id)
      const appMenus = { ...state.appMenus }
      const windowErrors = { ...state.windowErrors }
      delete appMenus[id]
      delete windowErrors[id]
      let focusedWindowId = state.focusedWindowId
      if (focusedWindowId === id) {
        const next = windows.filter((win) => win.phase === 'open').sort((a, b) => b.z - a.z)[0]
        focusedWindowId = next?.id ?? null
      }
      return { windows, appMenus, windowErrors, focusedWindowId }
    })
    scheduleSave()
  },

  minimizeWindow: (id) => {
    set((state) => ({
      windows: state.windows.map((win) => (win.id === id && win.phase === 'open' ? { ...win, phase: 'minimizing' } : win)),
    }))
  },

  commitMinimized: (id) => {
    set((state) => {
      const windows = state.windows.map((win) => (win.id === id ? { ...win, phase: 'minimized' as const } : win))
      let focusedWindowId = state.focusedWindowId
      if (focusedWindowId === id) {
        const next = windows.filter((win) => win.phase === 'open').sort((a, b) => b.z - a.z)[0]
        focusedWindowId = next?.id ?? null
      }
      return { windows, focusedWindowId }
    })
    scheduleSave()
  },

  toggleMaximize: (id) => {
    set((state) => ({
      focusedWindowId: id,
      windows: state.windows.map((win) => {
        if (win.id !== id) return win
        if (win.maximized && win.restore) {
          return { ...win, maximized: false, x: win.restore.x, y: win.restore.y, width: win.restore.width, height: win.restore.height, restore: null, phase: 'open' }
        }
        const area = workArea()
        return {
          ...win,
          maximized: true,
          restore: { x: win.x, y: win.y, width: win.width, height: win.height },
          x: area.x,
          y: area.y,
          width: area.width,
          height: area.height,
          phase: 'open',
        }
      }),
    }))
    scheduleSave()
  },

  setGeometry: (id, geometry) => {
    set((state) => ({
      windows: state.windows.map((win) => (win.id === id ? { ...win, ...geometry } : win)),
    }))
    scheduleSave()
  },

  refitMaximized: () => {
    const area = workArea()
    const any = get().windows.some((win) => win.maximized)
    if (!any) return
    set((state) => ({
      windows: state.windows.map((win) => (win.maximized ? { ...win, ...area } : win)),
    }))
    scheduleSave()
  },

  setTitle: (id, title) => {
    set((state) => ({
      windows: state.windows.map((win) => (win.id === id ? { ...win, title } : win)),
    }))
  },

  setMenus: (id, menus) => set((state) => ({ appMenus: { ...state.appMenus, [id]: menus } })),

  setWindowScreens: (id, screens) => {
    const current = get().windows.find((win) => win.id === id)
    if (!current || JSON.stringify(current.screens) === JSON.stringify(screens)) return
    set((state) => ({
      windows: state.windows.map((win) => (win.id === id ? { ...win, screens } : win)),
    }))
    scheduleSave()
  },

  setWindowError: (id, error) =>
    set((state) => {
      const windowErrors = { ...state.windowErrors }
      if (error) windowErrors[id] = error
      else delete windowErrors[id]
      return { windowErrors }
    }),

  pushToast: (title, body) => {
    const toast: Toast = { id: nanoid(8), title, body }
    set((state) => ({ toasts: [...state.toasts.slice(-3), toast] }))
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  setTheme: (theme) => {
    set({ theme })
    scheduleSave()
  },

  setAccent: (accent) => {
    set({ accent })
    scheduleSave()
  },

  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen, spotlightOpen: drawerOpen ? false : get().spotlightOpen }),
  setSpotlightOpen: (spotlightOpen) => set({ spotlightOpen, drawerOpen: spotlightOpen ? false : get().drawerOpen }),
  setInteracting: (interacting) => set({ interacting }),

  cycleWindows: () => {
    const { windows, focusedWindowId, zCounter } = get()
    const open = windows.filter((win) => win.phase === 'open').sort((a, b) => a.z - b.z)
    if (open.length < 2) {
      if (open[0] && focusedWindowId !== open[0].id) get().focusWindow(open[0].id)
      return
    }
    const index = Math.max(0, open.findIndex((win) => win.id === focusedWindowId))
    const next = open[(index + 1) % open.length]
    const z = zCounter + 1
    set((state) => ({
      zCounter: z,
      focusedWindowId: next.id,
      windows: state.windows.map((win) => (win.id === next.id ? { ...win, z } : win)),
    }))
    scheduleSave()
  },
}))

let saveTimer = 0

function scheduleSave(): void {
  if (!useShell.getState().loaded) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const state = useShell.getState()
    const body = {
      theme: state.theme,
      accent: state.accent,
      wallpaper: state.wallpaper,
      dockPins: state.dockPins,
      focusedWindowId: state.focusedWindowId,
      windows: state.windows
        .filter((win) => win.phase !== 'closing')
        .map((win) => ({
          id: win.id,
          appId: win.appId,
          x: win.x,
          y: win.y,
          width: win.width,
          height: win.height,
          minimized: win.phase === 'minimized' || win.phase === 'minimizing',
          maximized: win.maximized,
          z: win.z,
          restore: win.restore,
          screens: win.screens,
        })),
    }
    void fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }, 350)
}

function windowFromSaved(saved: NonNullable<SettingsPayload['windows']>[number], app: AppManifest): Win {
  return {
    id: saved.id,
    appId: saved.appId,
    title: app.name,
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    minWidth: app.window.minWidth,
    minHeight: app.window.minHeight,
    resizable: app.window.resizable,
    maximized: Boolean(saved.maximized),
    restore: saved.restore ?? null,
    z: saved.z ?? 1,
    phase: saved.minimized ? 'minimized' : 'open',
    version: app.version,
    screens: Array.isArray(saved.screens) ? saved.screens : [],
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

export async function bootShell(): Promise<void> {
  const [appsRes, settingsRes] = await Promise.all([fetch('/api/apps'), fetch('/api/settings')])
  const apps = appsRes.ok ? ((await appsRes.json()) as AppManifest[]) : []
  const settings = settingsRes.ok ? ((await settingsRes.json()) as SettingsPayload) : {}
  useShell.getState().hydrate(apps, settings)
}
