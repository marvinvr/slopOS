import fs from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
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
  try {
    const data = await fs.readFile(file)
    const ext = path.extname(file).toLowerCase()
    const hashed = file.includes(`${path.sep}assets${path.sep}`) || file.includes(`${path.sep}chunks${path.sep}`)
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': ext === '.html' ? 'no-cache' : hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : data)
    return true
  } catch {
    return false
  }
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
