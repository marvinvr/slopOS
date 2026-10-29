import { compileApp, compileErrorModule } from '../apps/compile'
import { readView } from './persist'

export async function viewBundle(appId: string, viewId: string): Promise<string | null> {
  const source = await readView(appId, viewId)
  if (source === null) return null
  const compiled = await compileApp(source)
  return compiled.ok ? compiled.code : compileErrorModule(compiled.errors)
}
