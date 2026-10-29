export type ThemeMode = 'light' | 'dark'

/** Paint the resolved theme onto an element. `auto` is resolved by the caller. */
export function applyTheme(mode: ThemeMode, accent?: string, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = mode
  root.style.colorScheme = mode
  if (!accent) return
  root.style.setProperty('--slop-accent', accent)
  root.style.setProperty('--slop-accent-soft', `color-mix(in srgb, ${accent} 16%, transparent)`)
  root.style.setProperty('--slop-accent-fg', contrastFg(accent))
}

export function resolveTheme(setting: 'light' | 'dark' | 'auto'): ThemeMode {
  if (setting === 'light' || setting === 'dark') return setting
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function contrastFg(hex: string): string {
  const raw = hex.replace('#', '').trim()
  if (raw.length < 6) return '#ffffff'
  const r = Number.parseInt(raw.slice(0, 2), 16)
  const g = Number.parseInt(raw.slice(2, 4), 16)
  const b = Number.parseInt(raw.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '#ffffff'
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.64 ? '#1c1b19' : '#ffffff'
}
