export const MENU_H = 36
export const DOCK_CLEAR = 96

export function workArea(): { x: number; y: number; width: number; height: number } {
  return {
    x: 8,
    y: MENU_H + 6,
    width: Math.max(320, window.innerWidth - 16),
    height: Math.max(220, window.innerHeight - MENU_H - 6 - DOCK_CLEAR),
  }
}

export function modLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl+'
  return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'
}
