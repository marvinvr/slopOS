export const MENU_H = 28
export const DOCK_CLEAR = 96

export function workArea(): { x: number; y: number; width: number; height: number } {
  return {
    x: 8,
    y: MENU_H + 6,
    width: Math.max(320, window.innerWidth - 16),
    height: Math.max(220, window.innerHeight - MENU_H - 6 - DOCK_CLEAR),
  }
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad/.test(navigator.platform)
}

export function modLabel(): string {
  return isMac() ? '⌘' : 'Ctrl+'
}

export function shortcutLabel(key: string, shift = false): string {
  if (isMac()) return `${shift ? '⇧' : ''}⌘${key}`
  return `Ctrl+${shift ? 'Shift+' : ''}${key}`
}
