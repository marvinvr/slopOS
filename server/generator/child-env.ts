const VENDOR_KEY = /^(XAI|GROK|OPENAI|ANTHROPIC)(_|$)/i

/** Child env is the parent env minus vendor API keys. slopOS never sets those keys. */
export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (isVendorApiKey(key)) continue
    env[key] = value
  }
  for (const [key, value] of Object.entries(extra)) {
    if (isVendorApiKey(key)) continue
    env[key] = value
  }
  return env
}

export function isVendorApiKey(key: string): boolean {
  if (key === 'XAI_API_KEY' || key === 'GROK_API_KEY' || key === 'OPENAI_API_KEY' || key === 'ANTHROPIC_API_KEY') return true
  if (!key.endsWith('_API_KEY') && !key.endsWith('_API_TOKEN') && !key.endsWith('_AUTH_TOKEN')) return false
  return VENDOR_KEY.test(key)
}
