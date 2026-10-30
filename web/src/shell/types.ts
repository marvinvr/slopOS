export type AppManifest = {
  id: string
  name: string
  icon: string
  description?: string
  tint?: string
  window: {
    width: number
    height: number
    minWidth: number
    minHeight: number
    resizable: boolean
  }
  version: number
  /** Made in an older format; opening it reinstalls it. */
  stale?: boolean
  prompt?: string
}

export type ThemeSetting = 'light' | 'dark' | 'auto'

export type Rect = { x: number; y: number; width: number; height: number }
