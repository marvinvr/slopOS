import type { GenKind, ProviderId } from './types'

const IDS: ProviderId[] = ['grok', 'codex', 'claude', 'mock']

export function providerId(): ProviderId {
  const raw = (process.env.SLOPOS_GENERATOR || 'grok').trim().toLowerCase()
  return IDS.includes(raw as ProviderId) ? (raw as ProviderId) : 'grok'
}

const DEFAULT_TIMEOUT = {
  app: 10 * 60 * 1000,
  view: 5 * 60 * 1000,
  content: 90 * 1000,
  route: 60 * 1000,
} as const

type TimeoutBucket = keyof typeof DEFAULT_TIMEOUT

function timeoutBucket(kind: string): TimeoutBucket {
  if (kind === 'view') return 'view'
  if (kind === 'content') return 'content'
  if (kind === 'route') return 'route'
  return 'app'
}

/** Per-kind env wins, then SLOPOS_TIMEOUT_MS, then the built-in default for that kind. */
export function timeoutFor(kind: string): number {
  const bucket = timeoutBucket(kind)
  const specific = Number(process.env[`SLOPOS_TIMEOUT_MS_${bucket.toUpperCase()}`])
  if (Number.isFinite(specific) && specific >= 1000) return specific
  const global = Number(process.env.SLOPOS_TIMEOUT_MS)
  if (Number.isFinite(global) && global >= 1000) return global
  return DEFAULT_TIMEOUT[bucket]
}

export function concurrency(): number {
  const n = Number(process.env.SLOPOS_CONCURRENCY)
  if (!Number.isFinite(n) || n < 1) return 2
  return Math.min(8, Math.floor(n))
}

/** Mock stream length. Default ~6s. Tests set a small value. */
export function mockMs(): number {
  const n = Number(process.env.SLOPOS_MOCK_MS)
  return Number.isFinite(n) && n >= 0 ? n : 6000
}

export function binFor(id: ProviderId): string {
  if (id === 'codex') return process.env.SLOPOS_CODEX_BIN?.trim() || 'codex'
  if (id === 'claude') return process.env.SLOPOS_CLAUDE_BIN?.trim() || 'claude'
  if (id === 'mock') return 'mock'
  return process.env.SLOPOS_GROK_BIN?.trim() || 'grok'
}

/**
 * Model and effort for a kind.
 * `SLOPOS_<P>_MODEL_<KIND>` / `_EFFORT_<KIND>` win.
 * Grok content and route keep their faster built-in default unless that kind override is set.
 * App and view use `SLOPOS_<P>_MODEL` / `_EFFORT`, then the built-in default.
 */
export function settingsFor(id: ProviderId, kind: GenKind): { model: string; effort: string } {
  if (id === 'mock') return { model: 'mock', effort: 'mock' }
  const prefix = `SLOPOS_${id.toUpperCase()}`
  const kindToken = kind.toUpperCase()
  const specificModel = process.env[`${prefix}_MODEL_${kindToken}`]?.trim()
  const specificEffort = process.env[`${prefix}_EFFORT_${kindToken}`]?.trim()
  const genericModel = process.env[`${prefix}_MODEL`]?.trim()
  const genericEffort = process.env[`${prefix}_EFFORT`]?.trim()
  const fast = kind === 'content' || kind === 'route'
  if (id === 'grok') {
    return {
      model: specificModel || (fast ? 'grok-4.7-build-fast' : genericModel || 'grok-4.7'),
      effort: specificEffort || (fast ? 'low' : genericEffort || 'medium'),
    }
  }
  return {
    model: specificModel || genericModel || 'default',
    effort: specificEffort || (fast ? 'low' : genericEffort || 'medium'),
  }
}

export function providerDisplay(id: ProviderId): string {
  if (id === 'codex') return 'Codex'
  if (id === 'claude') return 'Claude'
  if (id === 'mock') return 'Mock'
  return 'Grok'
}

export function signedOutReason(id: ProviderId): string {
  if (id === 'codex') return "Codex isn't signed in — run `codex login` once in a terminal to renew the login"
  if (id === 'claude') return "Claude isn't signed in — run `claude` once in a terminal to renew the login"
  if (id === 'mock') return 'Mock generator is unavailable'
  return "Grok isn't signed in — run `grok` once in a terminal to renew the login"
}

const AUTH_RE =
  /isn'?t signed in|not logged in|logged out|login expired|sign in|log in again|authentication (required|failed)|please (log|sign) in|unauthorized|invalid api key|auth(entication)? error|run `?(grok|claude|codex)`?|oauth|not authenticated|refresh (your )?login|\/login\b/i

export function looksLikeAuth(text: string): boolean {
  return AUTH_RE.test(text)
}

export function redact(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '…')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
}
