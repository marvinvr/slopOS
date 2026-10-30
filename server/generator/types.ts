/** Provider contract from docs/SPEC.md › Generator providers, plus the fields the pipeline needs. */

export type ProviderId = 'grok' | 'codex' | 'claude' | 'mock'

export type GenKind = 'app' | 'view'

export type GenEvent =
  | { type: 'status' | 'thinking' | 'text' | 'tool' | 'log'; text: string }
  | { type: 'end'; output?: string; usage?: object }
  | { type: 'error'; message: string; auth?: boolean }

export type Availability = {
  available: boolean
  loggedIn?: boolean
  reason?: string
  model: string
  effort: string
}

export type RunOptions = {
  prompt: string
  cwd: string
  kind: GenKind
  signal: AbortSignal
  timeoutMs: number
  model: string
  effort: string
}

export interface GeneratorProvider {
  id: ProviderId
  availability(): Promise<Availability>
  run(opts: RunOptions): AsyncIterable<GenEvent>
  shutdown?(): Promise<void>
}

export type GenResult =
  | { kind: 'view'; viewId: string; appId: string; title?: string }
  | { kind: 'app'; appId: string; name?: string; version?: number }

export type SseEvent =
  | { type: 'status'; text: string; step?: string; seq?: number }
  | { type: 'thinking'; text: string; seq?: number }
  | { type: 'text'; text: string; seq?: number }
  | { type: 'tool'; text: string; seq?: number }
  | { type: 'log'; text: string; seq?: number }
  | { type: 'done'; result?: GenResult; seq?: number }
  | { type: 'error'; message: string; auth?: boolean; seq?: number }

export class GeneratorError extends Error {
  auth: boolean
  constructor(message: string, auth = false) {
    super(message)
    this.name = 'GeneratorError'
    this.auth = auth
  }
}
