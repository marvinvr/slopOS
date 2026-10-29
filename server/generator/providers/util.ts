import { execFile } from 'node:child_process'
import os from 'node:os'
import { authBlock, blockedAvailability } from '../auth'
import { childEnv } from '../child-env'
import { redact } from '../config'
import type { Availability } from '../types'

export function memoAvailability(load: () => Promise<Availability>): () => Promise<Availability> {
  let slot: { at: number; value: Availability } | null = null
  return async () => {
    const block = authBlock()
    if (block) return blockedAvailability(block)
    if (slot && Date.now() - slot.at < 60_000) return slot.value
    const value = await load()
    slot = { at: Date.now(), value }
    return value
  }
}

export async function capture(bin: string, args: string[], timeout = 20_000): Promise<{ missing: boolean; text: string; code: number }> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, maxBuffer: 1_000_000, env: childEnv() }, (err, stdout, stderr) => {
      const missing = (err as NodeJS.ErrnoException | null)?.code === 'ENOENT'
      const text = `${stdout || ''}\n${stderr || ''}`
      const status = (err as { status?: number } | null)?.status
      resolve({ missing, text, code: typeof status === 'number' ? status : err ? 1 : 0 })
    })
  })
}

export function publicError(text: string): string {
  const home = os.homedir()
  const stripped = home ? text.split(home).join('~') : text
  return redact(stripped)
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    const stop = () => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', stop, { once: true })
  })
}
