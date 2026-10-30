export type AppWindow = {
  width: number
  height: number
  minWidth: number
  minHeight: number
  resizable: boolean
}

export type AppManifest = {
  id: string
  name: string
  icon: string
  description?: string
  /** CSS color for the tile. Otherwise the shell derives a stable hue from `id`. */
  tint?: string
  window: AppWindow
  version: number
  createdAt?: string
  updatedAt?: string
  /** Original generation prompt, when the app was generated. */
  prompt?: string
  /** Prompt history. Each entry records the kind, the text, the version it produced, and when. */
  prompts?: { at: string; prompt: string; kind?: string; version?: number }[]
  /** Made in an older format without an HTML first screen. Opening it reinstalls it. */
  stale?: boolean
}
