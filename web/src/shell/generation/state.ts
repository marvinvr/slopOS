import { useSyncExternalStore } from 'react'
import { useShell } from '../store'
import { fetchJobs, postAuto, postCancel, postEdit, postFix, postRegenerate, postRevert, type GenResult, type JobInfo } from './api'

export type GrokStatus = {
  available: boolean
  loggedIn?: boolean
  model?: string
  effort?: string
  reason?: string
  provider?: string
}

/** A job bound to a window. The window shows a placeholder until it lands. */
export type Build = {
  windowId: string
  kind: 'create' | 'edit' | 'regenerate' | 'fix'
  jobId?: string
  appId?: string
  failed?: boolean
  retry: () => void
}

type Snapshot = {
  status: GrokStatus
  jobs: JobInfo[]
  builds: Build[]
  editAppId: string | null
}

const listeners = new Set<() => void>()
let status: GrokStatus = { available: false, reason: 'Checking…' }
let jobs: JobInfo[] = []
let builds: Build[] = []
let editAppId: string | null = null
let statusAt = 0
let statusFlight: Promise<void> | null = null
// useSyncExternalStore bails the tree if getSnapshot returns a new object every call.
let snap: Snapshot = { status, jobs, builds, editAppId }

const fresh = new Map<string, { at: number; version: number; used: boolean }>()

function emit(): void {
  snap = { status, jobs, builds, editAppId }
  for (const listener of listeners) listener()
}

function snapshot(): Snapshot {
  return snap
}

export function useGeneration(): Snapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot,
  )
}

export function useGrokStatus(): GrokStatus {
  const state = useGeneration()
  return state.status
}

export function refreshStatus(force = false): Promise<void> {
  if (statusFlight) return statusFlight
  if (!force && statusAt && Date.now() - statusAt < 30_000) return Promise.resolve()
  statusAt = Date.now()
  statusFlight = fetch('/api/health')
    .then((res) => res.json())
    .then((body: { grok?: GrokStatus }) => {
      if (body.grok) status = { ...body.grok, reason: body.grok.reason?.replace(/`/g, '') }
      emit()
    })
    .catch(() => {
      if (status.reason !== 'Checking…') return
      status = { available: false, reason: 'Can’t reach slopOS right now.' }
      emit()
    })
    .finally(() => {
      statusFlight = null
    })
  return statusFlight
}

async function ready(): Promise<void> {
  await refreshStatus(status.reason === 'Checking…')
}

export async function refreshJobs(): Promise<void> {
  jobs = await fetchJobs()
  emit()
}

export function closeEdit(): void {
  editAppId = null
  emit()
}

export function buildFor(windowId: string): Build | undefined {
  return builds.find((build) => build.windowId === windowId)
}

function putBuild(build: Build): void {
  builds = [...builds.filter((item) => item.windowId !== build.windowId), build]
  emit()
}

function patchBuild(windowId: string, patch: Partial<Build>): void {
  builds = builds.map((build) => (build.windowId === windowId ? { ...build, ...patch } : build))
  emit()
}

export function dropBuild(windowId: string): void {
  if (!buildFor(windowId)) return
  builds = builds.filter((build) => build.windowId !== windowId)
  emit()
}

export function failBuild(windowId: string): void {
  patchBuild(windowId, { failed: true, jobId: undefined })
}

/** Run a job for this window. Failures stay in the window; nothing is announced. */
function runBuild(build: Build, start: () => Promise<{ jobId?: string; cached?: boolean; result?: GenResult }>): void {
  putBuild(build)
  void (async () => {
    await ready()
    if (!status.available) {
      failBuild(build.windowId)
      return
    }
    try {
      const body = await start()
      if (!buildFor(build.windowId)) {
        if (body.jobId && build.kind === 'create') void postCancel(body.jobId).catch(() => undefined)
        return
      }
      if (body.result && !body.jobId) {
        await finishBuild(build.windowId, body.result)
        return
      }
      if (!body.jobId) throw new Error('No job')
      patchBuild(build.windowId, { jobId: body.jobId })
      void refreshJobs()
    } catch {
      failBuild(build.windowId)
    }
  })()
}

/** The job landed: put the app into its window. */
export async function finishBuild(windowId: string, result: GenResult | undefined): Promise<void> {
  const build = buildFor(windowId)
  if (!build) return
  if (!result || result.kind !== 'app') {
    failBuild(windowId)
    return
  }
  await openGenerated(result, build.kind !== 'fix', windowId)
  dropBuild(windowId)
}

/** Pending windows are opened by the caller, so the window is up before any network. */
export function startGeneration(prompt: string, title?: string): void {
  const text = prompt.trim()
  if (!text) return
  const windowId = useShell.getState().openPending(title?.trim() || titleFor(text))
  const retry = () => runBuild({ windowId, kind: 'create', retry }, () => postAuto(text))
  retry()
}

export function openEditApp(appId: string): void {
  editAppId = appId
  emit()
}

/** Bring up a window for the app so the change has somewhere to land. */
function windowForApp(appId: string): string | null {
  const shell = useShell.getState()
  shell.openApp(appId)
  const win = useShell.getState().windows.filter((item) => item.appId === appId && item.phase !== 'closing').sort((a, b) => b.z - a.z)[0]
  return win?.id ?? null
}

export function submitEdit(appId: string, prompt: string): void {
  const text = prompt.trim()
  if (!text) return
  editAppId = null
  emit()
  const windowId = windowForApp(appId)
  if (!windowId) return
  const retry = () => runBuild({ windowId, kind: 'edit', appId, retry }, () => postEdit(appId, text))
  retry()
}

export function regenerateApp(appId: string): void {
  const windowId = windowForApp(appId)
  if (!windowId) return
  const retry = () => runBuild({ windowId, kind: 'regenerate', appId, retry }, () => postRegenerate(appId))
  retry()
}

export function fixApp(appId: string, error: string, windowId?: string): void {
  const target = windowId ?? windowForApp(appId)
  if (!target) return
  const retry = () => runBuild({ windowId: target, kind: 'fix', appId, retry }, () => postFix(appId, error))
  retry()
}

export async function restoreAppVersion(appId: string, version: number): Promise<void> {
  await postRevert(appId, version)
  await useShell.getState().refreshApps()
  const app = useShell.getState().apps.find((item) => item.id === appId)
  const next = app?.version ?? version
  useShell.setState((state) => {
    const windowErrors = { ...state.windowErrors }
    const windows = state.windows.map((win) => {
      if (win.appId !== appId) return win
      delete windowErrors[win.id]
      return { ...win, version: next, title: app?.name || win.title }
    })
    return { windows, windowErrors }
  })
}

export async function openGenerated(result: Extract<GenResult, { kind: 'app' }>, markFresh: boolean, windowId?: string): Promise<void> {
  await useShell.getState().refreshApps()
  const target = windowId ? useShell.getState().windows.find((win) => win.id === windowId && win.phase !== 'closing') : undefined
  if (target && target.appId !== result.appId) useShell.getState().adoptWindow(target.id, result.appId, result.version)
  const app = useShell.getState().apps.find((item) => item.id === result.appId)
  const version = result.version || app?.version
  if (version) {
    useShell.setState((state) => {
      const windowErrors = { ...state.windowErrors }
      const windows = state.windows.map((win) => {
        if (win.appId !== result.appId) return win
        delete windowErrors[win.id]
        return { ...win, version, title: result.name || app?.name || win.title }
      })
      return { windows, windowErrors }
    })
  }
  if (markFresh && version) fresh.set(result.appId, { at: Date.now(), version, used: false })
  if (target) useShell.getState().focusWindow(target.id)
  else if (!windowId) useShell.getState().openApp(result.appId)
}

export function noteRuntimeError(windowId: string, appId: string, version: number, message: string): void {
  const mark = fresh.get(appId)
  if (!mark || mark.used || mark.version !== version) return
  if (Date.now() - mark.at > 10_000) return
  mark.used = true
  fixApp(appId, message, windowId)
}

export function cancelBuild(windowId: string): void {
  const build = buildFor(windowId)
  if (!build) return
  dropBuild(windowId)
  if (build.jobId && build.kind === 'create') void postCancel(build.jobId).catch(() => undefined)
}

export function jobActive(job: JobInfo): boolean {
  return job.state === 'queued' || job.state === 'running'
}

/** "a pomodoro timer" → "Pomodoro Timer". Only a window title until the real name arrives. */
export function titleFor(prompt: string): string {
  const line = prompt.replace(/\s+/g, ' ').trim().replace(/^(an?|the)\s+/i, '')
  const short = line.length > 32 ? `${line.slice(0, 31).trim()}…` : line
  return short.replace(/(^|\s)(\p{Ll})/gu, (_, space: string, letter: string) => space + letter.toUpperCase())
}
