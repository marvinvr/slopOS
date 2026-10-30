import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

type Event = { type: string; text?: string; message?: string; result?: { kind?: string; appId?: string; name?: string; viewId?: string } }

async function main(): Promise<void> {
  const port = await freePort()
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'slopos-gen-'))
  const tsx = path.join(root, 'node_modules', '.bin', 'tsx')
  let log = ''
  const child = spawn(tsx, ['server/index.ts'], {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      SLOPOS_GENERATOR: 'mock',
      SLOPOS_DATA_DIR: data,
      SLOPOS_MOCK_MS: '80',
      SLOPOS_CONCURRENCY: '2',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.on('data', (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-6000)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-6000)
  })
  const base = `http://127.0.0.1:${port}`
  try {
    await waitFor(`${base}/api/health`, 15000)
    const health = await json<{ grok: { available?: boolean; provider?: string } }>(base, '/api/health')
    assert(health.grok.available === true, 'mock generator should be available')
    assert(health.grok.provider === 'mock', 'health should name the mock provider')

    const created = await runJob(base, '/api/apps/generate', { prompt: 'a pomodoro timer' })
    const appId = created.result?.appId
    assert(created.result?.kind === 'app' && appId, 'create should return an app')
    const app = await json<{ manifest: { name: string; icon: string; version: number }; html: string }>(base, `/api/apps/${appId}`)
    assert(app.html.includes('slop-mark v1'), 'first version should be marked v1')
    assert(app.html.includes('<script>'), 'the screen keeps its own script')
    assert(app.manifest.name.length <= 20 && app.manifest.name.length > 0, 'name should be at most 20 characters')

    const screen = await fetch(`${base}/api/apps/${appId}/screens/root`)
    const doc = await screen.text()
    const csp = screen.headers.get('content-security-policy') || ''
    assert(screen.status === 200 && doc.includes('/runtime/hook.js') && doc.includes('slop-mark v1'), 'the first screen should be served with the hook')
    assert(doc.indexOf('/runtime/hook.js') < doc.indexOf('<script>'), 'the hook should run before the screen script')
    assert(csp.includes("connect-src 'none'") && csp.includes("frame-ancestors 'self'"), 'the screen should carry its CSP')

    const matched = await json<{ cached?: boolean; result?: { kind?: string; appId?: string } }>(base, '/api/gen', {
      kind: 'auto',
      intent: 'Pomodoro',
    })
    assert(matched.cached === true && matched.result?.appId === appId, 'an exact app name should open the existing app')

    const edited = await runJob(base, `/api/apps/${appId}/edit`, { prompt: 'add a short footnote' })
    assert(edited.result?.kind === 'app', 'edit should return the app')
    const editedApp = await json<{ html: string; manifest: { version: number } }>(base, `/api/apps/${appId}`)
    assert(editedApp.html.includes('slop-mark v2'), 'edit should write the next version')
    assert(editedApp.manifest.version === 2, 'edit should bump the version')

    const reverted = await json<{ version: number }>(base, `/api/apps/${appId}/revert`, { version: 1 })
    assert(reverted.version === 1, 'revert should restore version 1')
    const restored = await json<{ html: string }>(base, `/api/apps/${appId}`)
    assert(restored.html.includes('slop-mark v1') && !restored.html.includes('slop-mark v2'), 'reverted screen should be v1')

    const removed = await fetch(`${base}/api/apps/${appId}`, { method: 'DELETE' })
    assert(removed.status === 200, 'delete should succeed')
    const gone = await fetch(`${base}/api/apps/${appId}`)
    assert(gone.status === 404, 'deleted app should be gone')

    const host = await runJob(base, '/api/apps/generate', { prompt: 'a quiet reading list' })
    const hostId = host.result?.appId
    assert(hostId, 'view host app should exist')
    const ask = { kind: 'view', appId: hostId, intent: 'Clicked “Settings”', key: `${hostId}:root:settings`, context: { from: 'root' } }
    const [left, right] = await Promise.all([json<{ jobId?: string }>(base, '/api/gen', ask), json<{ jobId?: string }>(base, '/api/gen', ask)])
    assert(left.jobId && left.jobId === right.jobId, 'in-flight requests with the same key should share a job')
    const view = await waitJob(base, left.jobId)
    assert(view.result?.kind === 'view' && view.result.viewId, 'view job should return a view id')
    const again = await json<{ cached?: boolean; result?: { viewId?: string } }>(base, '/api/gen', ask)
    assert(again.cached === true && again.result?.viewId === view.result.viewId, 'the same screen and interaction should be cached')
    const page = await fetch(`${base}/api/apps/${hostId}/screens/${view.result.viewId}`)
    assert(page.status === 200 && (await page.text()).includes('Show more'), 'the next screen should be served')

    const world = await json<{ digest?: string }>(base, '/api/world')
    assert(typeof world.digest === 'string', 'world digest should be a string')

    const reset = await json<{ ok?: boolean }>(base, '/api/reset', { confirm: 'RESET' })
    assert(reset.ok === true, 'reset should confirm')
    const apps = await json<unknown[]>(base, '/api/apps')
    assert(Array.isArray(apps) && apps.length === 0, 'reset should wipe apps')

    console.log('test:gen passed')
  } catch (err) {
    console.error(log)
    throw err
  } finally {
    await stop(child)
    await fs.rm(data, { recursive: true, force: true })
  }
}

async function runJob(base: string, url: string, body: unknown): Promise<{ events: Event[]; result?: Event['result'] }> {
  const started = await json<{ jobId?: string; error?: string }>(base, url, body)
  if (!started.jobId) throw new Error(`no job from ${url}: ${started.error || 'unknown'}`)
  return waitJob(base, started.jobId)
}

async function waitJob(base: string, jobId: string): Promise<{ events: Event[]; result?: Event['result'] }> {
  const res = await fetch(`${base}/api/jobs/${jobId}/events`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`events ${res.status} for ${jobId}`)
  const text = await res.text()
  const events: Event[] = []
  for (const part of text.split('\n\n')) {
    const line = part.split('\n').find((item) => item.startsWith('data: '))
    if (!line) continue
    events.push(JSON.parse(line.slice(6)) as Event)
  }
  const done = [...events].reverse().find((event) => event.type === 'done')
  const error = [...events].reverse().find((event) => event.type === 'error')
  if (!done) throw new Error(error?.message || `job ${jobId} did not finish`)
  return { events, result: done.result }
}

async function json<T>(base: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${url}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || `${url} failed (${res.status})`)
  return data
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
      last = `${res.status}`
    } catch (err) {
      last = err instanceof Error ? err.message : 'offline'
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`server did not start (${last})`)
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => {
        if (!port || port === 4747) reject(new Error('could not reserve a spare port'))
        else resolve(port)
      })
    })
    server.on('error', reject)
  })
}

async function stop(child: ChildProcess): Promise<void> {
  if (!child.pid) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await new Promise((resolve) => setTimeout(resolve, 300))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
