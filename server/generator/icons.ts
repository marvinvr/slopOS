import * as lucide from 'lucide-react'

const NOT_ICONS = new Set(['createLucideIcon', 'Icon', 'icons', 'default'])
const table = lucide as unknown as Record<string, unknown>

function isIconExport(name: string, value: unknown): boolean {
  if (NOT_ICONS.has(name) || !/^[A-Z]/.test(name)) return false
  if (typeof value === 'function') return true
  if (!value || typeof value !== 'object') return false
  return typeof (value as { render?: unknown }).render === 'function'
}

const names = new Set(Object.keys(table).filter((name) => isIconExport(name, table[name])))

export function lucideIcon(name: unknown): string {
  if (typeof name === 'string' && names.has(name)) return name
  return 'Sparkles'
}
