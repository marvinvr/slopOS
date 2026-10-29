import { providerId, redact, settingsFor } from './config'
import type { Availability } from './types'

let blocked: { reason: string; until: number } | null = null

export function noteAuthFailure(reason: string): void {
  blocked = { reason: redact(reason), until: Date.now() + 60_000 }
}

export function authBlock(): string | null {
  if (!blocked) return null
  if (Date.now() >= blocked.until) {
    blocked = null
    return null
  }
  return blocked.reason
}

export function clearAuthBlock(): void {
  blocked = null
}

/** Fill model/effort on a blocked availability result without probing the CLI. */
export function blockedAvailability(reason: string): Availability {
  const settings = settingsFor(providerId(), 'app')
  return { available: false, loggedIn: false, reason, model: settings.model, effort: settings.effort }
}
