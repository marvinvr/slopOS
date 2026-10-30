import { workArea } from './metrics'
import type { Rect } from './types'

export type SnapTarget = 'left' | 'right' | 'max'
export type SnapSide = 'left' | 'right'

/** How close the pointer must be to a screen edge before a snap preview appears. */
export const SNAP_EDGE = 16

export function snapFrame(target: SnapTarget): Rect {
  const area = workArea()
  if (target === 'max') return area
  const gap = 6
  const width = Math.floor((area.width - gap) / 2)
  if (target === 'left') return { x: area.x, y: area.y, width, height: area.height }
  return { x: area.x + area.width - width, y: area.y, width, height: area.height }
}

export function previewAt(x: number, y: number): SnapTarget | null {
  if (x <= SNAP_EDGE) return 'left'
  if (x >= window.innerWidth - SNAP_EDGE) return 'right'
  if (y <= SNAP_EDGE) return 'max'
  return null
}
