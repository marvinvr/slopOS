const TIMEOUT_MS = 15_000
const MAX_RESPONSE = 1_000_000

export type ProxyRequest = {
  url?: unknown
  method?: unknown
  headers?: unknown
  body?: unknown
}

export type ProxyResult =
  | { ok: true; status: number; headers: Record<string, string>; body: string }
  | { ok: false; error: string }

const HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade'])

/** GET/POST only, http(s) only, 15s timeout, 1MB response cap. */
export async function proxyRequest(input: ProxyRequest): Promise<ProxyResult> {
  if (typeof input.url !== 'string' || !input.url) return { ok: false, error: 'url is required' }
  let target: URL
  try {
    target = new URL(input.url)
  } catch {
    return { ok: false, error: 'url is invalid' }
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { ok: false, error: 'only http and https URLs are allowed' }
  }
  if (target.username || target.password) return { ok: false, error: 'URLs with credentials are not allowed' }

  const method = typeof input.method === 'string' ? input.method.toUpperCase() : 'GET'
  if (method !== 'GET' && method !== 'POST') return { ok: false, error: 'only GET and POST are allowed' }

  const headers: Record<string, string> = {}
  if (input.headers && typeof input.headers === 'object' && !Array.isArray(input.headers)) {
    for (const [key, value] of Object.entries(input.headers as Record<string, unknown>)) {
      if (typeof value !== 'string') continue
      if (HOP.has(key.toLowerCase())) continue
      headers[key] = value
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(target, {
      method,
      headers,
      body: method === 'POST' && typeof input.body === 'string' ? input.body : undefined,
      signal: controller.signal,
      redirect: 'follow',
    })
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > MAX_RESPONSE) return { ok: false, error: 'response too large' }
    const outHeaders: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      if (!HOP.has(key)) outHeaders[key] = value
    })
    return { ok: true, status: res.status, headers: outHeaders, body: buf.toString('utf8') }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { ok: false, error: 'request timed out' }
    return { ok: false, error: err instanceof Error ? err.message : 'request failed' }
  } finally {
    clearTimeout(timer)
  }
}
