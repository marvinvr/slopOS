import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib'
import type { IncomingMessage, ServerResponse } from 'node:http'

const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.map', '.txt'])
const TEXT_TYPE = /^(text\/|application\/(javascript|json|xml)|image\/svg\+xml)/

/** Skip tiny bodies. Compression can make them larger, and the CPU is not worth it. */
export const COMPRESS_MIN = 1024

const cache = new Map<string, Buffer>()
const CACHE_MAX = 128

export function isTextExtension(ext: string): boolean {
  return TEXT_EXT.has(ext)
}

/** Prefer brotli, then gzip. q=0 disables a coding. */
export function negotiateEncoding(req: IncomingMessage): 'br' | 'gzip' | null {
  const header = req.headers['accept-encoding']
  if (!header || Array.isArray(header)) return null
  let br = 0
  let gzip = 0
  for (const part of header.split(',')) {
    const [rawName, ...params] = part.trim().split(';')
    const name = rawName.trim().toLowerCase()
    if (!name || name === 'identity') continue
    let q = 1
    for (const param of params) {
      const [key, value] = param.trim().split('=')
      if (key === 'q') q = Number(value)
    }
    if (!Number.isFinite(q) || q <= 0) continue
    if (name === 'br') br = q
    else if (name === 'gzip') gzip = q
  }
  if (br > 0 && br >= gzip) return 'br'
  if (gzip > 0) return 'gzip'
  return null
}

export function compressBody(body: Buffer, encoding: 'br' | 'gzip'): Buffer {
  if (encoding === 'br') {
    return brotliCompressSync(body, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 6,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: body.length,
      },
    })
  }
  return gzipSync(body, { level: 8 })
}

/** Memory cache for bodies that are not already on disk (app bundles, missing siblings). */
export function cachedCompress(key: string, body: Buffer, encoding: 'br' | 'gzip'): Buffer {
  const id = `${encoding}:${key}`
  const hit = cache.get(id)
  if (hit) return hit
  const next = compressBody(body, encoding)
  cache.set(id, next)
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  return next
}

export function encodingFor(req: IncomingMessage, size: number, extOrType: string): 'br' | 'gzip' | null {
  if (size < COMPRESS_MIN) return null
  const textual = extOrType.startsWith('.') ? isTextExtension(extOrType) : TEXT_TYPE.test(extOrType)
  if (!textual) return null
  return negotiateEncoding(req)
}

export function sendEncoded(
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  headers: Record<string, string>,
  cacheKey: string,
  encoding: 'br' | 'gzip' | null,
): void {
  const payload = encoding ? cachedCompress(cacheKey, body, encoding) : body
  const out: Record<string, string | number> = {
    ...headers,
    'Content-Length': payload.length,
    Vary: 'Accept-Encoding',
  }
  if (encoding) out['Content-Encoding'] = encoding
  res.writeHead(200, out)
  res.end(req.method === 'HEAD' ? undefined : payload)
}
