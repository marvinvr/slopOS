import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Handler } from './http'

type Part = string | { param: string }

type Route = { method: string; parts: Part[]; handler: Handler }

export function createRouter() {
  const routes: Route[] = []

  function add(method: string, path: string, handler: Handler) {
    const parts: Part[] = path
      .split('/')
      .filter(Boolean)
      .map((part) => (part.startsWith(':') ? { param: part.slice(1) } : part))
    routes.push({ method, parts, handler })
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const parts = url.pathname.split('/').filter(Boolean).map((part) => safeDecode(part))
    if (parts.includes(null)) return false
    const segs = parts as string[]
    for (const route of routes) {
      if (route.method !== req.method) continue
      if (route.parts.length !== segs.length) continue
      const params: Record<string, string> = {}
      let matched = true
      for (let i = 0; i < segs.length; i++) {
        const expected = route.parts[i]
        const actual = segs[i]
        if (typeof expected === 'string') {
          if (expected !== actual) {
            matched = false
            break
          }
        } else if (expected) {
          params[expected.param] = actual
        }
      }
      if (!matched) continue
      await route.handler({ req, res, params, query: url.searchParams })
      return true
    }
    return false
  }

  return {
    get: (path: string, handler: Handler) => add('GET', path, handler),
    post: (path: string, handler: Handler) => add('POST', path, handler),
    put: (path: string, handler: Handler) => add('PUT', path, handler),
    delete: (path: string, handler: Handler) => add('DELETE', path, handler),
    handle,
  }
}

export type Router = ReturnType<typeof createRouter>

function safeDecode(part: string): string | null {
  try {
    const value = decodeURIComponent(part)
    if (value.includes('\0') || value.includes('/') || value.includes('\\')) return null
    return value
  } catch {
    return null
  }
}
