import fs from 'node:fs/promises'
import path from 'node:path'
import { appsDir, fixturesDir, storageDir, workspacesDir } from '../paths'
import type { AppManifest, AppWindow } from './types'

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

const DEFAULT_WINDOW: AppWindow = {
  width: 640,
  height: 480,
  minWidth: 320,
  minHeight: 240,
  resizable: true,
}

export function fixturesEnabled(): boolean {
  return process.env.SLOP_FIXTURES === '1'
}

export async function listApps(): Promise<AppManifest[]> {
  const generated = await readTree(appsDir, false)
  const byId = new Map(generated.map((app) => [app.id, app]))
  if (fixturesEnabled()) {
    for (const fixture of await readTree(fixturesDir, true)) {
      if (!byId.has(fixture.id)) byId.set(fixture.id, fixture)
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function getApp(id: string): Promise<{ manifest: AppManifest; source: string } | null> {
  if (!ID_RE.test(id)) return null
  const generated = await readOne(appsDir, id, false)
  if (generated) return generated
  if (fixturesEnabled()) return readOne(fixturesDir, id, true)
  return null
}

export async function deleteApp(id: string): Promise<'ok' | 'not-found' | 'fixture'> {
  if (!ID_RE.test(id)) return 'not-found'
  const dir = path.join(appsDir, id)
  const manifestPath = path.join(dir, 'manifest.json')
  try {
    await fs.access(manifestPath)
  } catch {
    if (fixturesEnabled()) {
      const fixture = await readOne(fixturesDir, id, true)
      if (fixture) return 'fixture'
    }
    return 'not-found'
  }
  await fs.rm(dir, { recursive: true, force: true })
  await fs.rm(path.join(storageDir, `${id}.json`), { force: true })
  await fs.rm(path.join(workspacesDir, id), { recursive: true, force: true })
  return 'ok'
}

async function readTree(dir: string, fixture: boolean): Promise<AppManifest[]> {
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const apps: AppManifest[] = []
  for (const name of names) {
    if (!ID_RE.test(name)) continue
    const loaded = await readOne(dir, name, fixture)
    if (loaded) apps.push(loaded.manifest)
  }
  return apps
}

async function readOne(
  dir: string,
  id: string,
  fixture: boolean,
): Promise<{ manifest: AppManifest; source: string } | null> {
  const base = path.join(dir, id)
  try {
    const [rawManifest, source] = await Promise.all([
      fs.readFile(path.join(base, 'manifest.json'), 'utf8'),
      fs.readFile(path.join(base, 'app.tsx'), 'utf8'),
    ])
    const manifest = normalizeManifest(JSON.parse(rawManifest) as Partial<AppManifest>, id, fixture)
    if (!manifest) return null
    return { manifest, source }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Skipping app ${id}:`, err instanceof Error ? err.message : err)
    }
    return null
  }
}

function normalizeManifest(raw: Partial<AppManifest>, id: string, fixture: boolean): AppManifest | null {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) return null
  const window: Partial<AppWindow> = raw.window ?? {}
  return {
    id,
    name: raw.name.trim(),
    icon: typeof raw.icon === 'string' && raw.icon ? raw.icon : 'AppWindow',
    description: typeof raw.description === 'string' ? raw.description : undefined,
    tint: typeof raw.tint === 'string' ? raw.tint : undefined,
    window: {
      width: num(window.width, DEFAULT_WINDOW.width),
      height: num(window.height, DEFAULT_WINDOW.height),
      minWidth: num(window.minWidth, DEFAULT_WINDOW.minWidth),
      minHeight: num(window.minHeight, DEFAULT_WINDOW.minHeight),
      resizable: window.resizable !== false,
    },
    version: num(raw.version, 1),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    prompt: typeof raw.prompt === 'string' ? raw.prompt : undefined,
    prompts: Array.isArray(raw.prompts) ? raw.prompts : undefined,
    fixture: fixture || undefined,
  }
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
