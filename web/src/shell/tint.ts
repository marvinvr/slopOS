export function tintFor(id: string, tint?: string): string {
  if (tint) return tint
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360} 46% 46%)`
}
