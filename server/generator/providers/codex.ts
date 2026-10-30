import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { binFor, looksLikeAuth, settingsFor, signedOutReason } from '../config'
import { childEnv } from '../child-env'
import type { Availability, GenEvent, GeneratorProvider, RunOptions } from '../types'
import { capture, memoAvailability, publicError } from './util'

const children = new Set<ChildProcess>()

const availability = memoAvailability(async (): Promise<Availability> => {
  const { model, effort } = settingsFor('codex', 'app')
  const probe = await capture(binFor('codex'), ['login', 'status'])
  if (probe.missing) return { available: false, loggedIn: false, model, effort, reason: 'Codex CLI was not found on PATH' }
  const signedIn = /logged in/i.test(probe.text) && !/not logged in/i.test(probe.text)
  if (!signedIn || looksLikeAuth(probe.text) && /sign in|not logged/i.test(probe.text)) {
    return { available: false, loggedIn: false, model, effort, reason: signedOutReason('codex') }
  }
  return { available: true, loggedIn: true, model, effort }
})

function argsFor(opts: RunOptions): string[] {
  const args = [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--ignore-rules',
    '-C',
    path.resolve(opts.cwd),
    // Read-only: the answer is text, nothing is written to the workspace.
    '--sandbox',
    'read-only',
    '-c',
    `model_reasoning_effort=${opts.effort}`,
    '-c',
    'approval_policy="never"',
  ]
  if (opts.model && opts.model !== 'default') args.push('-m', opts.model)
  args.push('-')
  return args
}

type Parsed = { output: string; events: GenEvent[]; failed?: string }

function consume(line: string, state: Parsed): void {
  let msg: Record<string, unknown>
  try {
    msg = JSON.parse(line) as Record<string, unknown>
  } catch {
    return
  }
  const type = String(msg.type || '')
  if (type === 'error' || type === 'turn.failed') {
    state.failed = publicError(messageOf(msg))
    return
  }
  if (type !== 'item.completed' && type !== 'item.started') return
  const item = (msg.item && typeof msg.item === 'object' ? msg.item : msg) as Record<string, unknown>
  const itemType = String(item.type || '')
  const text = typeof item.text === 'string' ? item.text : ''
  if (itemType === 'reasoning' || itemType === 'reasoning_text') {
    if (text) state.events.push({ type: 'thinking', text })
    return
  }
  if (itemType === 'agent_message' || itemType === 'message') {
    if (text) {
      state.output = text
      state.events.push({ type: 'text', text })
    }
    return
  }
  if (itemType === 'command_execution') {
    const command = typeof item.command === 'string' ? item.command : 'command'
    state.events.push({ type: 'tool', text: command.slice(0, 160) })
    return
  }
  if (itemType === 'file_change') {
    const file = fileOf(item)
    state.events.push({ type: 'tool', text: `write ${file}` })
  }
}

function messageOf(msg: Record<string, unknown>): string {
  if (typeof msg.message === 'string') return msg.message
  const error = msg.error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof (error as { message?: string }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Codex failed'
}

function fileOf(item: Record<string, unknown>): string {
  if (typeof item.path === 'string') return path.basename(item.path)
  const changes = item.changes
  if (Array.isArray(changes) && changes[0] && typeof changes[0] === 'object' && typeof (changes[0] as { path?: string }).path === 'string') {
    return path.basename((changes[0] as { path: string }).path)
  }
  return 'file'
}

async function* run(opts: RunOptions): AsyncIterable<GenEvent> {
  const child = spawn(binFor('codex'), argsFor(opts), {
    cwd: path.resolve(opts.cwd),
    env: childEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  children.add(child)
  child.stdin?.write(opts.prompt)
  child.stdin?.end()
  const state: Parsed = { output: '', events: [] }
  let stderr = ''
  let stdout = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-4000)
  })
  const onAbort = () => child.kill('SIGTERM')
  opts.signal.addEventListener('abort', onAbort, { once: true })
  try {
    child.stdout?.setEncoding('utf8')
    for await (const chunk of child.stdout || []) {
      stdout += chunk
      const lines = stdout.split('\n')
      stdout = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        const before = state.events.length
        consume(line, state)
        for (const event of state.events.slice(before)) yield event
        if (state.failed) break
      }
      if (state.failed || opts.signal.aborted) break
    }
    const exit = await waitExit(child)
    if (opts.signal.aborted) return
    if (stdout.trim()) consume(stdout, state)
    if (state.failed) {
      yield { type: 'error', message: state.failed, auth: looksLikeAuth(state.failed) || looksLikeAuth(stderr) }
      return
    }
    const output = state.output
    const auth = looksLikeAuth(stderr) || looksLikeAuth(output)
    if (exit !== 0 && !output) {
      const message = publicError(stderr || `Codex exited ${exit}`)
      yield { type: 'error', message, auth: auth || looksLikeAuth(message) }
      return
    }
    if (auth && exit !== 0) {
      yield { type: 'error', message: signedOutReason('codex'), auth: true }
      return
    }
    yield { type: 'end', output }
  } finally {
    opts.signal.removeEventListener('abort', onAbort)
    children.delete(child)
  }
}

function waitExit(child: ChildProcess): Promise<number> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode)
  return new Promise((resolve) => {
    child.once('exit', (code) => resolve(code ?? 1))
    child.once('error', () => resolve(1))
  })
}

async function shutdown(): Promise<void> {
  for (const child of children) child.kill('SIGTERM')
  children.clear()
}

export const codexProvider: GeneratorProvider = {
  id: 'codex',
  availability,
  run,
  shutdown,
}
