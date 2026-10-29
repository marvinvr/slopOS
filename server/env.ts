import fs from 'node:fs'
import path from 'node:path'
import { root } from './paths'

const BLOCKED = new Set(['XAI_API_KEY', 'GROK_API_KEY'])

/** Load `.env` without ever accepting API keys. Existing process env wins. */
export function loadEnv(): void {
  const file = path.join(root, '.env')
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!/^[A-Z0-9_]+$/.test(key)) continue
    if (BLOCKED.has(key) || key.endsWith('_API_KEY')) continue
    if (process.env[key] === undefined) process.env[key] = value
  }
}
