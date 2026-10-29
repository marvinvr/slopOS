export type WallpaperId = 'mesh' | 'grove' | 'dusk' | 'clay'

export const WALLPAPERS: { id: WallpaperId; label: string; preview: string }[] = [
  { id: 'mesh', label: 'Linen', preview: 'linear-gradient(140deg, #f6e7d4, #e7b196)' },
  { id: 'grove', label: 'Grove', preview: 'linear-gradient(140deg, #e7eedb, #8ea36a)' },
  { id: 'dusk', label: 'Dusk', preview: 'linear-gradient(140deg, #e4d5de, #8d6c8a)' },
  { id: 'clay', label: 'Clay', preview: 'linear-gradient(140deg, #f3d4c4, #c45c3e)' },
]

const IDS = new Set<string>(WALLPAPERS.map((item) => item.id))

export function wallpaperId(value: string): WallpaperId {
  return IDS.has(value) ? (value as WallpaperId) : 'mesh'
}

export function nextWallpaper(value: string): WallpaperId {
  const index = WALLPAPERS.findIndex((item) => item.id === wallpaperId(value))
  return WALLPAPERS[(index + 1) % WALLPAPERS.length]!.id
}
