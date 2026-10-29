import fs from 'node:fs/promises'
import path from 'node:path'
import { dataDir } from '../paths'

export type SessionRecord = {
  sessionId: string
  model: string
  effort: string
  cwd: string
}

const file = () => path.join(dataDir, 'generator', 'sessions.json')
const memory = new Map<string, SessionRecord>()
let loaded = false

async function ensure(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const raw = JSON.parse(await fs.readFile(file(), 'utf8')) as Record<string, SessionRecord>
    if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw)) {
        if (value && typeof value.sessionId === 'string') memory.set(key, value)
      }
    }
  } catch {
    /* first run */
  }
}

export async function loadSession(key: string): Promise<SessionRecord | null> {
  await ensure()
  return memory.get(key) ?? null
}

export async function saveSession(key: string, record: SessionRecord): Promise<void> {
  await ensure()
  memory.set(key, record)
  await fs.mkdir(path.dirname(file()), { recursive: true })
  await fs.writeFile(file(), JSON.stringify(Object.fromEntries(memory), null, 2))
}

export async function clearSessions(): Promise<void> {
  memory.clear()
  loaded = true
}
