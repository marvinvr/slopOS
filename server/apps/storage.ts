import fs from 'node:fs/promises'
import path from 'node:path'
import { storageDir } from '../paths'

const chains = new Map<string, Promise<unknown>>()

function fileFor(appId: string): string {
  return path.join(storageDir, `${appId}.json`)
}

async function readAll(appId: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(fileFor(appId), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeAll(appId: string, data: Record<string, unknown>): Promise<void> {
  await fs.mkdir(storageDir, { recursive: true })
  const file = fileFor(appId)
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2))
  await fs.rename(tmp, file)
}

function withApp<T>(appId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(appId) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  chains.set(appId, next)
  return next
}

export function storageGetAll(appId: string): Promise<Record<string, unknown>> {
  return withApp(appId, () => readAll(appId))
}

export function storageGet(appId: string, key: string): Promise<unknown> {
  return withApp(appId, async () => {
    const data = await readAll(appId)
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined
  })
}

export function storageSet(appId: string, key: string, value: unknown): Promise<void> {
  return withApp(appId, async () => {
    const data = await readAll(appId)
    data[key] = value
    await writeAll(appId, data)
  })
}

export function storageRemove(appId: string, key: string): Promise<void> {
  return withApp(appId, async () => {
    const data = await readAll(appId)
    delete data[key]
    await writeAll(appId, data)
  })
}
