import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { client, methods, ndJsonStream, PROTOCOL_VERSION, RequestError, type ClientConnection, type SessionUpdate } from '@agentclientprotocol/sdk'
import { binFor, looksLikeAuth, settingsFor, signedOutReason } from '../config'
import { childEnv } from '../child-env'
import { loadSession, saveSession } from '../sessions'
import { allowWorkspaceTool, resolveInside } from '../safe-path'
import type { Availability, GenEvent, GeneratorProvider, RunOptions } from '../types'
import { capture, memoAvailability, publicError } from './util'

type Mode = 'files' | 'none'

type Live = {
  key: string
  child: ChildProcess
  connection: ClientConnection
  loadSession: boolean
  dead: boolean
  stderr: string
  sessions: Map<string, { cwd: string; mode: Mode }>
  updates: Map<string, (update: SessionUpdate) => void>
}

const pools = new Map<string, Live>()
const starting = new Map<string, Promise<Live>>()

const availability = memoAvailability(async (): Promise<Availability> => {
  const { model, effort } = settingsFor('grok', 'app')
  const probe = await capture(binFor('grok'), ['models'])
  if (probe.missing) {
    return { available: false, loggedIn: false, model, effort, reason: 'Grok CLI was not found on PATH' }
  }
  if (looksLikeAuth(probe.text) || !/logged in/i.test(probe.text)) {
    return { available: false, loggedIn: false, model, effort, reason: signedOutReason('grok') }
  }
  return { available: true, loggedIn: true, model, effort }
})

function poolKey(model: string, effort: string): string {
  return `${model}\0${effort}`
}

async function ensurePool(model: string, effort: string): Promise<Live> {
  const key = poolKey(model, effort)
  const existing = pools.get(key)
  if (existing && !existing.dead) return existing
  const pending = starting.get(key)
  if (pending) return pending
  const created = startPool(key, model, effort)
  starting.set(key, created)
  try {
    const live = await created
    pools.set(key, live)
    return live
  } finally {
    starting.delete(key)
  }
}

async function startPool(key: string, model: string, effort: string): Promise<Live> {
  const bin = binFor('grok')
  const child = spawn(bin, ['agent', '--no-leader', '-m', model, '--reasoning-effort', effort, 'stdio'], {
    cwd: os.tmpdir(),
    env: childEnv({ GROK_CLAUDE_MCPS_ENABLED: '0', GROK_MEMORY: '0' }),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (!child.stdin || !child.stdout) {
    child.kill()
    throw new Error('Grok did not expose stdio pipes')
  }
  const holder: { live?: Live } = {}
  const app = client({ name: 'slopOS' })
    .onRequest(methods.client.session.requestPermission, (ctx) => decide(holder.live, ctx.params))
    .onRequest(methods.client.fs.readTextFile, async (ctx) => {
      const root = workspaceOf(holder.live, ctx.params.sessionId)
      if (!root) throw RequestError.invalidParams(undefined, 'unknown session')
      const full = await resolveInside(root, ctx.params.path)
      let text = await fs.readFile(full, 'utf8')
      if (ctx.params.line || ctx.params.limit) {
        const lines = text.split('\n')
        const start = Math.max(0, (ctx.params.line || 1) - 1)
        const end = ctx.params.limit ? start + ctx.params.limit : lines.length
        text = lines.slice(start, end).join('\n')
      }
      return { content: text }
    })
    .onRequest(methods.client.fs.writeTextFile, async (ctx) => {
      const meta = holder.live?.sessions.get(ctx.params.sessionId)
      if (!meta || meta.mode === 'none') throw RequestError.invalidParams(undefined, 'writes are not allowed for this turn')
      const full = await resolveInside(meta.cwd, ctx.params.path)
      await fs.mkdir(path.dirname(full), { recursive: true })
      await fs.writeFile(full, ctx.params.content)
      return {}
    })
    .onNotification(methods.client.session.update, (ctx) => {
      holder.live?.updates.get(ctx.params.sessionId)?.(ctx.params.update)
    })

  const stream = ndJsonStream(Writable.toWeb(child.stdin) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>)
  const connection = app.connect(stream)
  const live: Live = {
    key,
    child,
    connection,
    loadSession: false,
    dead: false,
    stderr: '',
    sessions: new Map(),
    updates: new Map(),
  }
  holder.live = live
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    live.stderr = (live.stderr + chunk).slice(-4000)
  })
  child.on('error', () => {
    live.dead = true
  })
  child.on('exit', () => {
    live.dead = true
  })
  connection.closed.then(() => {
    live.dead = true
  }).catch(() => {
    live.dead = true
  })
  try {
    const init = await connection.agent.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'slopOS', version: '0.1.0' },
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
    })
    live.loadSession = Boolean(init.agentCapabilities?.loadSession)
    return live
  } catch (err) {
    live.dead = true
    child.kill()
    const message = err instanceof Error ? err.message : 'Grok ACP failed to start'
    throw new Error(publicError(`${message}\n${live.stderr}`))
  }
}

function workspaceOf(live: Live | undefined, sessionId: string): string | null {
  return live?.sessions.get(sessionId)?.cwd ?? null
}

function decide(live: Live | undefined, params: { sessionId: string; toolCall: { kind?: string | null; name?: string | null; title?: string | null; locations?: { path: string }[] | null; rawInput?: unknown }; options: { optionId: string; kind: string }[] }): { outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' } } {
  const meta = live?.sessions.get(params.sessionId)
  const allow = meta
    ? allowWorkspaceTool(meta.cwd, params.toolCall, meta.mode)
    : false
  const kinds = allow ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always']
  const option = params.options.find((item) => kinds.includes(item.kind))
  if (!option) return { outcome: { outcome: 'cancelled' } }
  return { outcome: { outcome: 'selected', optionId: option.optionId } }
}

function textOf(content: { type?: string; text?: string } | undefined): string {
  return content?.type === 'text' ? content.text || '' : ''
}

function mapUpdate(update: SessionUpdate): GenEvent | null {
  if (update.sessionUpdate === 'agent_thought_chunk') {
    const text = textOf(update.content)
    return text ? { type: 'thinking', text } : null
  }
  if (update.sessionUpdate === 'agent_message_chunk') {
    const text = textOf(update.content)
    return text ? { type: 'text', text } : null
  }
  if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
    const title = update.title || update.name || 'tool'
    return { type: 'tool', text: String(title) }
  }
  return null
}

class Gate<T> {
  private items: T[] = []
  private waiters: ((value: T) => void)[] = []
  push(value: T): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter(value)
    else this.items.push(value)
  }
  next(): Promise<T> {
    const item = this.items.shift()
    if (item !== undefined) return Promise.resolve(item)
    return new Promise((resolve) => this.waiters.push(resolve))
  }
}

async function openSession(live: Live, opts: RunOptions, restarted: boolean): Promise<string> {
  const cwd = path.resolve(opts.cwd)
  const mode: Mode = opts.kind === 'content' || opts.kind === 'route' ? 'none' : 'files'
  const remember = (sessionId: string) => {
    live.sessions.set(sessionId, { cwd, mode })
    return sessionId
  }
  if (!restarted && opts.resumeSessionId && !opts.freshSession) return remember(opts.resumeSessionId)
  if (!opts.freshSession && opts.sessionKey) {
    const saved = await loadSession(opts.sessionKey)
    if (saved && saved.model === opts.model && saved.effort === opts.effort && saved.cwd === cwd) {
      if (!restarted && live.sessions.has(saved.sessionId)) return remember(saved.sessionId)
      if (live.loadSession) {
        try {
          await live.connection.agent.request(methods.agent.session.load, { sessionId: saved.sessionId, cwd, mcpServers: [] })
          return remember(saved.sessionId)
        } catch {
          /* the saved id is not loadable on this process */
        }
      } else if (!restarted && live.sessions.has(saved.sessionId)) {
        return remember(saved.sessionId)
      }
    }
  }
  const created = await live.connection.agent.request(methods.agent.session.new, { cwd, mcpServers: [] })
  if (opts.sessionKey) await saveSession(opts.sessionKey, { sessionId: created.sessionId, model: opts.model, effort: opts.effort, cwd })
  return remember(created.sessionId)
}

function isDeath(err: unknown, live?: Live): boolean {
  if (live?.dead) return true
  const message = err instanceof Error ? err.message : String(err)
  return /agent exited|EPIPE|connection closed|socket hang up|broken pipe/i.test(message)
}

async function* turn(opts: RunOptions, restarted: boolean): AsyncIterable<GenEvent> {
  const live = await ensurePool(opts.model, opts.effort)
  if (live.dead) throw new Error('agent exited')
  const sessionId = await openSession(live, opts, restarted)
  const queue = new Gate<{ event?: GenEvent; done?: boolean; error?: unknown }>()
  let output = ''
  live.updates.set(sessionId, (update) => {
    const event = mapUpdate(update)
    if (!event) return
    if (event.type === 'text') output += event.text
    queue.push({ event })
  })
  const onAbort = () => {
    void live.connection.agent.notify(methods.agent.session.cancel, { sessionId }).catch(() => undefined)
    queue.push({ error: Object.assign(new Error('cancelled'), { aborted: true }) })
  }
  opts.signal.addEventListener('abort', onAbort, { once: true })
  const request = live.connection.agent.request(
    methods.agent.session.prompt,
    { sessionId, prompt: [{ type: 'text', text: opts.prompt }] },
    { cancellationSignal: opts.signal },
  )
  void request.then(() => queue.push({ done: true })).catch((error: unknown) => queue.push({ error }))
  try {
    while (true) {
      const item = await queue.next()
      if (item.event) yield item.event
      if (item.error) throw item.error
      if (item.done) break
    }
    if (opts.signal.aborted) return
    if (live.dead) throw new Error('agent exited')
    const auth = looksLikeAuth(output) || looksLikeAuth(live.stderr)
    if (auth) {
      yield { type: 'error', message: signedOutReason('grok'), auth: true }
      return
    }
    yield { type: 'end', sessionId, output }
    if (opts.sessionKey) await saveSession(opts.sessionKey, { sessionId, model: opts.model, effort: opts.effort, cwd: path.resolve(opts.cwd) })
  } finally {
    live.updates.delete(sessionId)
    opts.signal.removeEventListener('abort', onAbort)
  }
}

function drop(model: string, effort: string): void {
  const key = poolKey(model, effort)
  const live = pools.get(key)
  pools.delete(key)
  if (!live) return
  live.dead = true
  live.connection.close()
  live.child.kill()
}

async function* run(opts: RunOptions): AsyncIterable<GenEvent> {
  try {
    yield* turn(opts, false)
  } catch (err) {
    if (opts.signal.aborted) return
    if (!isDeath(err)) {
      const message = publicError(err instanceof Error ? err.message : 'Grok failed')
      yield { type: 'error', message, auth: looksLikeAuth(message) }
      return
    }
    drop(opts.model, opts.effort)
    try {
      yield { type: 'status', text: 'Restarting Grok' }
      yield* turn(opts, true)
    } catch (err2) {
      if (opts.signal.aborted) return
      const message = publicError(err2 instanceof Error ? err2.message : 'Grok failed')
      yield { type: 'error', message, auth: looksLikeAuth(message) }
    }
  }
}

async function shutdown(): Promise<void> {
  for (const live of pools.values()) {
    live.dead = true
    live.connection.close()
    live.child.kill()
  }
  pools.clear()
}

export const grokProvider: GeneratorProvider = {
  id: 'grok',
  availability,
  run,
  shutdown,
}
