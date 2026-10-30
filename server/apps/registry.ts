import fs from 'node:fs/promises'
import path from 'node:path'
import { forgetApp } from '../generator/world'
import { appsDir, workspacesDir } from '../paths'
import type { AppManifest, AppWindow } from './types'

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

const DEFAULT_WINDOW: AppWindow = {
  width: 640,
  height: 480,
  minWidth: 320,
  minHeight: 240,
  resizable: true,
}

export async function listApps(): Promise<AppManifest[]> {
  let names: string[]
  try {
    names = await fs.readdir(appsDir)
  } catch {
    return []
  }
  const apps: AppManifest[] = []
  for (const name of names) {
    if (!ID_RE.test(name)) continue
    const loaded = await getApp(name)
    if (loaded) apps.push(loaded.manifest)
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name))
}

/** The manifest and the first screen's HTML (empty for an app from the older format). */
export async function getApp(id: string): Promise<{ manifest: AppManifest; html: string } | null> {
  if (!ID_RE.test(id)) return null
  const base = path.join(appsDir, id)
  let rawManifest: string
  try {
    rawManifest = await fs.readFile(path.join(base, 'manifest.json'), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`Skipping app ${id}:`, err instanceof Error ? err.message : err)
    return null
  }
  const html = await fs.readFile(path.join(base, 'index.html'), 'utf8').catch(() => null)
  try {
    const manifest = normalizeManifest(JSON.parse(rawManifest) as Partial<AppManifest>, id, html === null)
    return manifest ? { manifest, html: html ?? '' } : null
  } catch (err) {
    console.error(`Skipping app ${id}:`, err instanceof Error ? err.message : err)
    return null
  }
}

export async function deleteApp(id: string): Promise<'ok' | 'not-found'> {
  if (!ID_RE.test(id)) return 'not-found'
  const dir = path.join(appsDir, id)
  try {
    await fs.access(path.join(dir, 'manifest.json'))
  } catch {
    return 'not-found'
  }
  await fs.rm(dir, { recursive: true, force: true })
  await fs.rm(path.join(workspacesDir, id), { recursive: true, force: true })
  await forgetApp(id)
  return 'ok'
}

function normalizeManifest(raw: Partial<AppManifest>, id: string, stale: boolean): AppManifest | null {
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
    prompts: normalizePrompts(raw.prompts),
    stale: stale || undefined,
  }
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizePrompts(value: unknown): AppManifest['prompts'] {
  if (!Array.isArray(value)) return undefined
  const prompts: NonNullable<AppManifest['prompts']> = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as { at?: unknown; prompt?: unknown; kind?: unknown; version?: unknown }
    if (typeof row.prompt !== 'string' || typeof row.at !== 'string') continue
    prompts.push({
      at: row.at,
      prompt: row.prompt,
      kind: typeof row.kind === 'string' ? row.kind : undefined,
      version: typeof row.version === 'number' ? row.version : undefined,
    })
  }
  return prompts.length ? prompts : undefined
}
