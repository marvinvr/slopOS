import fs from 'node:fs/promises'
import path from 'node:path'
import { nanoid } from 'nanoid'
import { jobsPath } from '../paths'
import { timeoutFor, concurrency } from './config'
import { noteAuthFailure } from './auth'
import { GeneratorError, type GenResult, type SseEvent } from './types'

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type JobSnapshot = {
  id: string
  state: JobState
  kind: string
  prompt: string
  appId?: string
  interactive: boolean
  createdAt: string
  startedAt?: string
  finishedAt?: string
  error?: string
  result?: unknown
}

type Job = JobSnapshot & {
  events: SseEvent[]
  listeners: Set<(event: SseEvent) => void>
  abort?: AbortController
  cacheKey?: string
  timeoutMs: number
  run: (ctx: JobContext) => Promise<unknown>
}

export type JobContext = {
  jobId: string
  signal: AbortSignal
  emit: (event: SseEvent) => void
  setAppId: (appId: string) => void
}

const jobs = new Map<string, Job>()
const byKey = new Map<string, string>()
let running = 0
let persistChain: Promise<void> = Promise.resolve()
let silenced = false

export function jobForKey(key: string): string | undefined {
  const id = byKey.get(key)
  if (!id) return undefined
  const job = jobs.get(id)
  if (!job || isTerminal(job.state)) {
    byKey.delete(key)
    return undefined
  }
  return id
}

export function enqueue(input: {
  kind: string
  prompt: string
  appId?: string
  interactive: boolean
  cacheKey?: string
  run: (ctx: JobContext) => Promise<unknown>
}): string {
  const existing = input.cacheKey ? jobForKey(input.cacheKey) : undefined
  if (existing) return existing
  const job: Job = {
    id: nanoid(12),
    state: 'queued',
    kind: input.kind,
    prompt: input.prompt,
    appId: input.appId,
    interactive: input.interactive,
    createdAt: new Date().toISOString(),
    events: [],
    listeners: new Set(),
    cacheKey: input.cacheKey,
    timeoutMs: timeoutFor(input.kind),
    run: input.run,
  }
  jobs.set(job.id, job)
  if (input.cacheKey) byKey.set(input.cacheKey, job.id)
  push(job, { type: 'status', step: 'queued', text: 'Queued' })
  pump()
  return job.id
}

export function listJobs(): JobSnapshot[] {
  return [...jobs.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 40)
    .map(snapshot)
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

export function subscribe(id: string, listener: (event: SseEvent) => void): (() => void) | null {
  const job = jobs.get(id)
  if (!job) return null
  job.listeners.add(listener)
  return () => job.listeners.delete(listener)
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id)
  if (!job) return false
  if (job.state === 'queued') {
    job.state = 'cancelled'
    job.finishedAt = new Date().toISOString()
    job.error = 'Cancelled'
    push(job, { type: 'error', message: 'Cancelled' })
    if (job.cacheKey) byKey.delete(job.cacheKey)
    schedulePersist()
    return true
  }
  if (job.state === 'running') {
    job.abort?.abort()
    return true
  }
  return false
}

export async function cancelAll(): Promise<void> {
  for (const job of jobs.values()) {
    if (job.state === 'queued' || job.state === 'running') cancelJob(job.id)
  }
  const deadline = Date.now() + 5000
  while (running > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

export async function loadJobs(): Promise<void> {
  try {
    const raw = JSON.parse(await fs.readFile(jobsPath, 'utf8')) as JobSnapshot[]
    if (!Array.isArray(raw)) return
    for (const saved of raw) {
      if (!saved || typeof saved.id !== 'string' || jobs.has(saved.id)) continue
      const state: JobState = saved.state === 'queued' || saved.state === 'running' ? 'failed' : saved.state
      const job: Job = {
        ...saved,
        state,
        error: state === 'failed' && (saved.state === 'queued' || saved.state === 'running') ? 'Interrupted by a restart' : saved.error,
        events: [],
        listeners: new Set(),
        timeoutMs: timeoutFor(saved.kind),
        run: async () => undefined,
      }
      jobs.set(job.id, job)
    }
  } catch {
    /* no history yet */
  }
}

export function silenceJobs(value: boolean): void {
  silenced = value
}

function pump(): void {
  const limit = concurrency()
  while (running < limit) {
    const next = pick()
    if (!next) return
    running += 1
    void runJob(next).finally(() => {
      running -= 1
      pump()
    })
  }
}

function pick(): Job | undefined {
  const queued = [...jobs.values()].filter((job) => job.state === 'queued')
  const interactive = queued.filter((job) => job.interactive).sort(byCreated)
  if (interactive.length) return interactive[0]
  return queued.sort(byCreated)[0]
}

async function runJob(job: Job): Promise<void> {
  if (job.state !== 'queued') return
  job.state = 'running'
  job.startedAt = new Date().toISOString()
  const abort = new AbortController()
  job.abort = abort
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    abort.abort()
  }, job.timeoutMs)
  try {
    const result = await job.run({
      jobId: job.id,
      signal: abort.signal,
      emit: (event) => push(job, event),
      setAppId: (appId) => {
        job.appId = appId
      },
    })
    if (abort.signal.aborted) {
      finishCancelled(job, timedOut)
      return
    }
    job.state = 'succeeded'
    job.result = result
    job.finishedAt = new Date().toISOString()
    push(job, { type: 'done', result: (result ?? undefined) as GenResult | undefined })
  } catch (err) {
    if (abort.signal.aborted) {
      finishCancelled(job, timedOut)
      return
    }
    const message = err instanceof Error ? err.message : 'Generation failed'
    const auth = err instanceof GeneratorError && err.auth
    job.state = 'failed'
    job.error = message
    job.finishedAt = new Date().toISOString()
    push(job, { type: 'error', message, auth })
    if (auth) noteAuthFailure(message)
  } finally {
    clearTimeout(timer)
    if (job.cacheKey) byKey.delete(job.cacheKey)
    schedulePersist()
  }
}

function finishCancelled(job: Job, timedOut: boolean): void {
  job.state = 'cancelled'
  job.error = timedOut ? 'Timed out' : 'Cancelled'
  job.finishedAt = new Date().toISOString()
  push(job, { type: 'error', message: job.error })
}

function push(job: Job, event: SseEvent): void {
  const next = { ...event, seq: job.events.length + 1 }
  job.events.push(next)
  if (job.events.length > 500) job.events.splice(0, job.events.length - 400)
  for (const listener of job.listeners) listener(next)
}

function snapshot(job: Job): JobSnapshot {
  return {
    id: job.id,
    state: job.state,
    kind: job.kind,
    prompt: job.prompt,
    appId: job.appId,
    interactive: job.interactive,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    result: job.result,
  }
}

function byCreated(a: Job, b: Job): number {
  return a.createdAt < b.createdAt ? -1 : 1
}

function isTerminal(state: JobState): boolean {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled'
}

export function dropJobs(): void {
  jobs.clear()
  byKey.clear()
  running = 0
}

export async function flushPersist(): Promise<void> {
  await persistChain
}

function schedulePersist(): void {
  if (silenced) return
  persistChain = persistChain.then(writeJobs).catch(() => undefined)
}

async function writeJobs(): Promise<void> {
  if (silenced) return
  const saved = [...jobs.values()].sort(byCreated).slice(-40).map(snapshot)
  await fs.mkdir(path.dirname(jobsPath), { recursive: true })
  await fs.writeFile(jobsPath, JSON.stringify(saved, null, 2))
}

export function eventsOf(id: string): SseEvent[] | null {
  const job = jobs.get(id)
  return job ? [...job.events] : null
}
