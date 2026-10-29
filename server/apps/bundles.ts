import { createHash } from 'node:crypto'
import { compileApp, compileErrorModule } from './compile'
import { getApp } from './registry'

const cache = new Map<string, string>()

export async function bundleFor(id: string): Promise<string | null> {
  const app = await getApp(id)
  if (!app) return null
  const hash = createHash('sha1').update(app.source).digest('hex').slice(0, 12)
  const key = `${app.manifest.id}@${app.manifest.version}:${hash}`
  const hit = cache.get(key)
  if (hit) return hit

  const compiled = await compileApp(app.source)
  const code = compiled.ok ? compiled.code : compileErrorModule(compiled.errors)
  if (compiled.ok) cache.set(key, code)
  return code
}
