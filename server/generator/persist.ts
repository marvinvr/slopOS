import fs from 'node:fs/promises'
import path from 'node:path'
import { getApp } from '../apps/registry'
import type { AppManifest, AppWindow } from '../apps/types'
import { appsDir, workspacesDir } from '../paths'
import { lucideIcon } from './icons'

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const STOP = new Set(['a', 'an', 'the', 'with', 'for', 'and', 'of', 'to', 'my', 'please', 'app'])

export function slugFromPrompt(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !STOP.has(word))
  const base = words.slice(0, 3).join('-').replace(/^-|-$/g, '').slice(0, 40)
  return base || 'app'
}

/** Reserve `data/apps/<id>` so two jobs cannot take the same id. */
export async function allocateId(prompt: string): Promise<string> {
  await fs.mkdir(appsDir, { recursive: true })
  const base = slugFromPrompt(prompt)
  for (let i = 0; i < 40; i++) {
    const id = i === 0 ? base : `${base}-${i + 1}`
    if (!ID_RE.test(id)) continue
    try {
      await fs.mkdir(path.join(appsDir, id))
      return id
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  }
  const id = `${base.slice(0, 48)}-${Date.now().toString(36)}`
  await fs.mkdir(path.join(appsDir, id))
  return id
}

export async function discardReserved(appId: string): Promise<void> {
  const manifest = path.join(appsDir, appId, 'manifest.json')
  try {
    await fs.access(manifest)
    return
  } catch {
    await fs.rm(path.join(appsDir, appId), { recursive: true, force: true })
    await fs.rm(path.join(workspacesDir, appId), { recursive: true, force: true })
  }
}

export function workspaceFor(appId: string): string {
  return path.join(workspacesDir, appId)
}

export async function ensureWorkspace(appId: string): Promise<string> {
  const dir = workspaceFor(appId)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export async function writeWorkspace(appId: string, files: Record<string, string>): Promise<string> {
  const dir = await ensureWorkspace(appId)
  await Promise.all(Object.entries(files).map(([name, content]) => fs.writeFile(path.join(dir, name), content)))
  return dir
}

export async function readWorkspace(appId: string, names: string[]): Promise<string | null> {
  const dir = workspaceFor(appId)
  for (const name of names) {
    try {
      return await fs.readFile(path.join(dir, name), 'utf8')
    } catch {
      /* try the next filename */
    }
  }
  return null
}

export async function readJsonWorkspace(appId: string, name: string): Promise<unknown | null> {
  const text = await readWorkspace(appId, [name])
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

type HistoryKind = 'create' | 'edit' | 'regenerate' | 'fix'

export async function saveAppVersion(input: {
  id: string
  source: string
  suggested: unknown
  kind: HistoryKind
  prompt: string
  previous?: AppManifest | null
}): Promise<AppManifest> {
  const now = new Date().toISOString()
  const previous = input.previous
  const version = previous ? previous.version + 1 : 1
  const suggested = input.suggested && typeof input.suggested === 'object' ? (input.suggested as Record<string, unknown>) : {}
  const name = clipName(typeof suggested.name === 'string' ? suggested.name : previous?.name || titleFrom(input.prompt))
  const manifest: AppManifest = {
    id: input.id,
    name,
    icon: lucideIcon(suggested.icon ?? previous?.icon),
    description: clip(typeof suggested.description === 'string' ? suggested.description : previous?.description || input.prompt, 180),
    tint: typeof suggested.tint === 'string' ? suggested.tint : previous?.tint,
    window: windowOf(suggested.window ?? previous?.window),
    version,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    prompt: previous?.prompt || input.prompt,
    prompts: [
      ...(previous?.prompts || []),
      { at: now, prompt: input.prompt, kind: input.kind, version },
    ],
  }
  const dir = path.join(appsDir, input.id)
  await fs.mkdir(path.join(dir, 'versions'), { recursive: true })
  await fs.writeFile(path.join(dir, 'app.tsx'), input.source)
  await fs.writeFile(path.join(dir, 'versions', `${version}.tsx`), input.source)
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

export async function revertApp(appId: string, version: number): Promise<AppManifest | null> {
  const loaded = await getApp(appId)
  if (!loaded || loaded.manifest.fixture) return null
  if (!Number.isInteger(version) || version < 1) return null
  const sourcePath = path.join(appsDir, appId, 'versions', `${version}.tsx`)
  let source: string
  try {
    source = await fs.readFile(sourcePath, 'utf8')
  } catch {
    return null
  }
  const now = new Date().toISOString()
  const manifest: AppManifest = {
    ...loaded.manifest,
    version,
    updatedAt: now,
    prompts: [
      ...(loaded.manifest.prompts || []),
      { at: now, prompt: `Reverted to version ${version}`, kind: 'revert', version },
    ],
  }
  await fs.writeFile(path.join(appsDir, appId, 'app.tsx'), source)
  await fs.writeFile(path.join(appsDir, appId, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

export async function saveView(appId: string, viewId: string, source: string, meta: { intent: string; title?: string }): Promise<void> {
  const dir = path.join(appsDir, appId, 'views', viewId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'view.tsx'), source)
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ id: viewId, ...meta, createdAt: new Date().toISOString() }, null, 2))
}

export async function readView(appId: string, viewId: string): Promise<string | null> {
  if (!ID_RE.test(appId) || !ID_RE.test(viewId)) return null
  try {
    return await fs.readFile(path.join(appsDir, appId, 'views', viewId, 'view.tsx'), 'utf8')
  } catch {
    return null
  }
}

function windowOf(raw: unknown): AppWindow {
  const value = raw && typeof raw === 'object' ? (raw as Partial<AppWindow>) : {}
  const width = clamp(num(value.width, 720), 320, 1200)
  const height = clamp(num(value.height, 480), 240, 900)
  return {
    width,
    height,
    minWidth: clamp(num(value.minWidth, 320), 280, width),
    minHeight: clamp(num(value.minHeight, 240), 200, height),
    resizable: value.resizable !== false,
  }
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clipName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim()
  if (!trimmed) return 'App'
  return trimmed.length <= 20 ? trimmed : trimmed.slice(0, 20).trim()
}

function clip(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trim()}…`
}

function titleFrom(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'App'
  const sentence = cleaned.split(/[.!?]/)[0] || cleaned
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}
