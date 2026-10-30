import { spawn, type ChildProcess } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { client, methods, ndJsonStream, PROTOCOL_VERSION, type ClientConnection, type SessionConfigOption, type SessionUpdate } from '@agentclientprotocol/sdk'
import { binFor, looksLikeAuth, settingsFor, signedOutReason } from '../config'
import { SCREEN_SYSTEM_PROMPT } from '../prompts'
import { childEnv } from '../child-env'
import type { Availability, GenEvent, GeneratorProvider, RunOptions } from '../types'
import { capture, memoAvailability, publicError } from './util'

type Live = {
  key: string
  child: ChildProcess
  connection: ClientConnection
  dead: boolean
  stderr: string
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
  // No tools: permission requests are refused and the client offers no file system.
  const app = client({ name: 'slopOS' })
    .onRequest(methods.client.session.requestPermission, (ctx) => refuse(ctx.params.options))
    .onNotification(methods.client.session.update, (ctx) => {
      holder.live?.updates.get(ctx.params.sessionId)?.(ctx.params.update)
    })

  const stream = ndJsonStream(Writable.toWeb(child.stdin) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>)
  const connection = app.connect(stream)
  const live: Live = {
    key,
    child,
    connection,
    dead: false,
    stderr: '',
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
    await connection.agent.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'slopOS', version: '0.1.0' },
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    })
    return live
  } catch (err) {
    live.dead = true
    child.kill()
    const message = err instanceof Error ? err.message : 'Grok ACP failed to start'
    throw new Error(publicError(`${message}\n${live.stderr}`))
  }
}


function refuse(options: { optionId: string; kind: string }[]): { outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' } } {
  const option = options.find((item) => item.kind === 'reject_once' || item.kind === 'reject_always')
  return option ? { outcome: { outcome: 'selected', optionId: option.optionId } } : { outcome: { outcome: 'cancelled' } }
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

function findOption(options: SessionConfigOption[] | null | undefined, id: string, category: string): SessionConfigOption | undefined {
  if (!options) return undefined
  return options.find((item) => item.id === id) || options.find((item) => item.category === category)
}

function selectableValues(option: SessionConfigOption): string[] {
  if (option.type !== 'select') return []
  const values: string[] = []
  for (const entry of option.options) {
    if ('options' in entry) {
      for (const child of entry.options) values.push(child.value)
    } else {
      values.push(entry.value)
    }
  }
  return values
}

/**
 * The CLI flag loses to the user's own config in ACP mode.
 * Set model and effort on the session so slopOS always wins.
 */
async function ensureSessionSettings(live: Live, sessionId: string, model: string, effort: string, advertised: SessionConfigOption[] | null | undefined): Promise<void> {
  let options = advertised ?? undefined
  const apply = async (fallbackId: string, category: string, value: string, label: string): Promise<void> => {
    const option = findOption(options, fallbackId, category)
    const configId = option?.id || fallbackId
    if (option?.type === 'select' && option.currentValue === value) return
    if (option?.type === 'select') {
      const choices = selectableValues(option)
      if (choices.length && !choices.includes(value)) {
        throw new Error(`Grok cannot use ${label} “${value}”. Available: ${choices.join(', ')}`)
      }
    }
    const updated = await live.connection.agent.request(methods.agent.session.setConfigOption, { sessionId, configId, value })
    options = updated.configOptions
    const next = findOption(options, configId, category)
    const current = next?.type === 'select' ? next.currentValue : undefined
    if (current !== value) {
      throw new Error(`Grok kept ${label} ${current || 'unset'} instead of ${value}`)
    }
  }
  if (model !== 'default') await apply('model', 'model', model, 'model')
  await apply('reasoning_effort', 'thought_level', effort, 'reasoning effort')
}

/**
 * Every turn is a fresh session with one answer.
 * Grok's own system prompt tells it to work with tools, so session/new replaces it.
 */
async function openSession(live: Live, opts: RunOptions): Promise<string> {
  const created = await live.connection.agent.request(methods.agent.session.new, {
    cwd: path.resolve(opts.cwd),
    mcpServers: [],
    _meta: { systemPromptOverride: SCREEN_SYSTEM_PROMPT },
  })
  await ensureSessionSettings(live, created.sessionId, opts.model, opts.effort, created.configOptions)
  return created.sessionId
}

function isDeath(err: unknown, live?: Live): boolean {
  if (live?.dead) return true
  const message = err instanceof Error ? err.message : String(err)
  return /agent exited|EPIPE|connection closed|socket hang up|broken pipe/i.test(message)
}

async function* turn(opts: RunOptions): AsyncIterable<GenEvent> {
  const live = await ensurePool(opts.model, opts.effort)
  if (live.dead) throw new Error('agent exited')
  const sessionId = await openSession(live, opts)
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
    yield { type: 'end', output }
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
    yield* turn(opts)
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
      yield* turn(opts)
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
