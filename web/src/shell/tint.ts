/** Mid-tone, warm, similar lightness. White glyphs stay readable in light and dark. */
const TINTS = [
  '#c4624a', // terracotta
  '#b86e40', // apricot
  '#6f8c6c', // sage
  '#3f8a82', // teal
  '#62769e', // slate blue
  '#8a6889', // plum
  '#c16b7a', // rose
  '#9c7a4e', // sand
  '#67844c', // moss
  '#7a756f', // graphite
]

/** Stable palette index from the app id. An explicit manifest tint wins. */
export function tintFor(id: string, tint?: string): string {
  if (tint) return tint
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return TINTS[hash % TINTS.length]!
}
