import fs from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { cachedCompress, encodingFor, isTextExtension } from './compress'
import { runtimeDir, webDir } from './paths'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

export async function serveRuntime(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  if (!url.pathname.startsWith('/runtime/')) return false
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const rel = url.pathname.slice('/runtime/'.length)
  const file = safeJoin(runtimeDir, rel)
  if (!file) {
    res.writeHead(400)
    res.end()
    return true
  }
  return sendFile(req, res, file)
}

export async function serveShell(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  const file = safeJoin(webDir, rel)
  if (file && (await sendFile(req, res, file))) return true
  if (url.pathname === '/favicon.ico' && (await sendFile(req, res, path.join(webDir, 'favicon.svg')))) return true
  if (rel.includes('.')) return false
  const index = path.join(webDir, 'index.html')
  return sendFile(req, res, index)
}

async function sendFile(req: IncomingMessage, res: ServerResponse, file: string): Promise<boolean> {
  let info: Awaited<ReturnType<typeof fs.stat>>
  try {
    info = await fs.stat(file)
  } catch {
    return false
  }
  if (!info.isFile()) return false
  const ext = path.extname(file).toLowerCase()
  const hashed = file.includes(`${path.sep}assets${path.sep}`) || file.includes(`${path.sep}chunks${path.sep}`)
  const cacheControl = ext === '.html' ? 'no-cache' : hashed ? 'public, max-age=31536000, immutable' : 'no-cache'
  const encoding = encodingFor(req, info.size, ext)
  let payload: Buffer
  try {
    payload = await loadPayload(file, info.mtimeMs, info.size, encoding)
  } catch {
    return false
  }
  const headers: Record<string, string | number> = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': payload.length,
    'Cache-Control': cacheControl,
  }
  if (isTextExtension(ext)) headers.Vary = 'Accept-Encoding'
  if (encoding) headers['Content-Encoding'] = encoding
  res.writeHead(200, headers)
  res.end(req.method === 'HEAD' ? undefined : payload)
  return true
}

/** Prefer a build-time `.br` / `.gz` sibling. Otherwise compress once and keep it in memory. */
async function loadPayload(file: string, mtimeMs: number, size: number, encoding: 'br' | 'gzip' | null): Promise<Buffer> {
  if (encoding) {
    const sibling = `${file}.${encoding === 'br' ? 'br' : 'gz'}`
    try {
      const sib = await fs.stat(sibling)
      if (sib.isFile() && sib.size > 0 && sib.mtimeMs + 1000 >= mtimeMs) return await fs.readFile(sibling)
    } catch {
      /* no precompressed sibling */
    }
  }
  const raw = await fs.readFile(file)
  if (!encoding) return raw
  return cachedCompress(`${file}:${mtimeMs}:${size}`, raw, encoding)
}

function safeJoin(root: string, rel: string): string | null {
  if (!rel || rel.includes('\0')) return null
  let decoded = rel
  try {
    decoded = decodeURIComponent(rel)
  } catch {
    return null
  }
  const full = path.normalize(path.join(root, decoded))
  const base = path.normalize(root + path.sep)
  if (full !== path.normalize(root) && !full.startsWith(base)) return null
  return full
}
