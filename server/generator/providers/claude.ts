import path from 'node:path'
import { binFor, looksLikeAuth, settingsFor, signedOutReason } from '../config'
import { childEnv } from '../child-env'
import { isInside } from '../safe-path'
import { loadSession, saveSession } from '../sessions'
import type { Availability, GenEvent, GeneratorProvider, RunOptions } from '../types'
import { FILE_SYSTEM_PROMPT, JSON_SESSION_RULES } from '../prompts'
import { capture, memoAvailability, publicError } from './util'

const FILE_TOOLS = ['Read', 'Write', 'Edit']
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

type LooseMessage = {
  type?: string
  subtype?: string
  session_id?: string
  result?: string
  is_error?: boolean
  structured_output?: unknown
  error?: string
  message?: { content?: Array<{ type?: string; text?: string; name?: string; input?: Record<string, unknown> }> }
}

const availability = memoAvailability(async (): Promise<Availability> => {
  const { model, effort } = settingsFor('claude', 'app')
  const probe = await capture(binFor('claude'), ['auth', 'status'])
  if (probe.missing) return { available: false, loggedIn: false, model, effort, reason: 'Claude CLI was not found on PATH' }
  const loggedIn = readLoggedIn(probe.text)
  if (loggedIn === false || (loggedIn === null && looksLikeAuth(probe.text))) {
    return { available: false, loggedIn: false, model, effort, reason: signedOutReason('claude') }
  }
  if (loggedIn !== true) {
    return { available: false, loggedIn: false, model, effort, reason: publicError(probe.text) || signedOutReason('claude') }
  }
  return { available: true, loggedIn: true, model, effort }
})

function readLoggedIn(text: string): boolean | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { loggedIn?: boolean }
    return typeof parsed.loggedIn === 'boolean' ? parsed.loggedIn : null
  } catch {
    return null
  }
}

function effortOf(value: string): 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  return EFFORTS.has(value) ? (value as 'low' | 'medium' | 'high' | 'xhigh' | 'max') : 'medium'
}

function pathsOf(input: Record<string, unknown> | undefined): string[] {
  if (!input) return []
  const found: string[] = []
  for (const key of ['file_path', 'path', 'notebook_path', 'target']) {
    const value = input[key]
    if (typeof value === 'string') found.push(value)
  }
  return found
}

async function resolveResume(opts: RunOptions): Promise<string | undefined> {
  if (opts.freshSession) return undefined
  if (opts.resumeSessionId) return opts.resumeSessionId
  if (!opts.sessionKey) return undefined
  const saved = await loadSession(opts.sessionKey)
  if (!saved || saved.cwd !== path.resolve(opts.cwd)) return undefined
  return saved.sessionId
}

async function* run(opts: RunOptions): AsyncIterable<GenEvent> {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  const cwd = path.resolve(opts.cwd)
  const tools = opts.kind === 'content' || opts.kind === 'route' ? [] : FILE_TOOLS
  const resume = await resolveResume(opts)
  const abort = new AbortController()
  const onAbort = () => abort.abort()
  opts.signal.addEventListener('abort', onAbort, { once: true })
  let output = ''
  let sessionId = resume
  const query = sdk.query({
    prompt: opts.prompt,
    options: {
      cwd,
      tools,
      allowedTools: tools,
      disallowedTools: ['Bash', 'PowerShell', 'WebSearch', 'WebFetch', 'Task', 'Agent', 'Skill', 'NotebookEdit', 'TodoWrite'],
      permissionMode: 'dontAsk',
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: opts.kind === 'content' || opts.kind === 'route' ? JSON_SESSION_RULES : FILE_SYSTEM_PROMPT,
      },
      settingSources: [],
      mcpServers: {},
      pathToClaudeCodeExecutable: binFor('claude'),
      resume,
      abortController: abort,
      env: childEnv(),
      maxTurns: tools.length ? 16 : 2,
      persistSession: true,
      model: opts.model && opts.model !== 'default' ? opts.model : undefined,
      effort: effortOf(opts.effort),
      outputFormat: opts.jsonSchema ? { type: 'json_schema', schema: opts.jsonSchema } : undefined,
      canUseTool: async (toolName, input) => {
        if (!FILE_TOOLS.includes(toolName)) return { behavior: 'deny', message: 'Only reading and editing files in the workspace is allowed.' }
        const outside = pathsOf(input).some((item) => !isInside(cwd, item))
        if (outside) return { behavior: 'deny', message: 'That path is outside the workspace.' }
        return { behavior: 'allow' }
      },
    },
  })
  try {
    for await (const message of query as AsyncIterable<LooseMessage>) {
      if (opts.signal.aborted) return
      if (message.session_id) sessionId = message.session_id
      if (message.type === 'assistant') {
        if (message.error === 'authentication_failed') {
          yield { type: 'error', message: signedOutReason('claude'), auth: true }
          return
        }
        for (const block of message.message?.content || []) {
          if (block.type === 'thinking' && block.text) yield { type: 'thinking', text: block.text }
          if (block.type === 'text' && block.text) {
            output += block.text
            yield { type: 'text', text: block.text }
          }
          if (block.type === 'tool_use') {
            const file = pathsOf(block.input).map((item) => path.basename(item)).find((item) => item.endsWith('.tsx')) || pathsOf(block.input)[0]
            const name = block.name || 'tool'
            yield { type: 'tool', text: file ? `${name} ${path.basename(file)}` : name }
          }
        }
        continue
      }
      if (message.type !== 'result') continue
      if (message.subtype !== 'success' || message.is_error) {
        const text = message.result || message.subtype || 'Claude failed'
        yield { type: 'error', message: publicError(text), auth: looksLikeAuth(text) }
        return
      }
      if (message.structured_output !== undefined) output = JSON.stringify(message.structured_output)
      else if (message.result) output = message.result
      if (sessionId && opts.sessionKey) {
        await saveSession(opts.sessionKey, { sessionId, model: opts.model, effort: opts.effort, cwd })
      }
      yield { type: 'end', sessionId, output }
      return
    }
    if (!opts.signal.aborted) yield { type: 'error', message: 'Claude ended without a result' }
  } catch (err) {
    if (opts.signal.aborted) return
    const message = publicError(err instanceof Error ? err.message : 'Claude failed')
    yield { type: 'error', message, auth: looksLikeAuth(message) }
  } finally {
    opts.signal.removeEventListener('abort', onAbort)
    query.close()
  }
}

export const claudeProvider: GeneratorProvider = {
  id: 'claude',
  availability,
  run,
}
