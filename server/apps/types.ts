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
  /** Prompt history. Pass C appends edit / regenerate / fix entries. */
  prompts?: { at: string; prompt: string; kind?: string }[]
  /** True when the app was loaded from fixtures/apps via SLOPOS_FIXTURES=1. */
  fixture?: boolean
}

export type CompileError = { message: string; line?: number; column?: number }

export type CompileResult = { ok: true; code: string } | { ok: false; errors: CompileError[] }
