import { providerId } from '../config'
import type { GeneratorProvider, ProviderId } from '../types'

let current: ProviderId | null = null
let provider: GeneratorProvider | null = null

/** Load only the selected provider. Switching generators shuts the previous one down. */
export async function getProvider(): Promise<GeneratorProvider> {
  const id = providerId()
  if (provider && current === id) return provider
  await provider?.shutdown?.()
  current = id
  if (id === 'mock') provider = (await import('./mock')).mockProvider
  else if (id === 'codex') provider = (await import('./codex')).codexProvider
  else if (id === 'claude') provider = (await import('./claude')).claudeProvider
  else provider = (await import('./grok')).grokProvider
  return provider
}
