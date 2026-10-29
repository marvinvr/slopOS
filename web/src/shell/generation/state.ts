import { useSyncExternalStore } from 'react'
import { useShell } from '../store'
import { fetchJobs, postCancel, postEdit, postFix, postGenerate, postRegenerate, type GenResult, type JobInfo } from './api'

export type GrokStatus = {
  available: boolean
  loggedIn?: boolean
  model?: string
  effort?: string
  reason?: string
  provider?: string
}

export type PanelJob = {
  jobId: string
  prompt: string
  kind: string
  appId?: string
  retry: () => void
}

type Snapshot = {
  status: GrokStatus
  jobs: JobInfo[]
  panel: PanelJob | null
  editAppId: string | null
}

const listeners = new Set<() => void>()
let status: GrokStatus = { available: false, reason: 'Checking…', provider: 'grok' }
let jobs: JobInfo[] = []
let panel: PanelJob | null = null
let editAppId: string | null = null
let statusAt = 0
let statusFlight: Promise<void> | null = null
// useSyncExternalStore bails the tree if getSnapshot returns a new object every call.
let snap: Snapshot = { status, jobs, panel, editAppId }

const fresh = new Map<string, { at: number; version: number; used: boolean }>()

function emit(): void {
  snap = { status, jobs, panel, editAppId }
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
      if (body.grok) status = { provider: 'grok', ...body.grok }
      emit()
    })
    .catch(() => undefined)
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

export function closePanel(): void {
  panel = null
  emit()
}

export function closeEdit(): void {
  editAppId = null
  emit()
}

async function blocked(): Promise<boolean> {
  await ready()
  if (status.available) return false
  useShell.getState().pushToast(status.reason || `${providerLabel(status.provider)} isn't available`)
  return true
}

function openPanel(next: PanelJob): void {
  panel = next
  emit()
  void refreshJobs()
}

export function startGeneration(prompt: string): void {
  const text = prompt.trim()
  if (!text) return
  void (async () => {
    if (await blocked()) return
    try {
      const body = await postGenerate(text)
      openPanel({ jobId: body.jobId, prompt: text, kind: 'create', retry: () => startGeneration(text) })
    } catch (err) {
      useShell.getState().pushToast('Could not start generation', err instanceof Error ? err.message : 'failed')
    }
  })()
}

export function openEditApp(appId: string): void {
  void (async () => {
    if (await blocked()) return
    editAppId = appId
    emit()
  })()
}

export function submitEdit(appId: string, prompt: string): void {
  const text = prompt.trim()
  if (!text) return
  editAppId = null
  emit()
  void (async () => {
    try {
      const body = await postEdit(appId, text)
      openPanel({ jobId: body.jobId, prompt: text, kind: 'edit', appId, retry: () => submitEdit(appId, text) })
    } catch (err) {
      useShell.getState().pushToast('Could not edit', err instanceof Error ? err.message : 'failed')
    }
  })()
}

export function regenerateApp(appId: string): void {
  void (async () => {
    if (await blocked()) return
    const app = useShell.getState().apps.find((item) => item.id === appId)
    try {
      const body = await postRegenerate(appId)
      openPanel({
        jobId: body.jobId,
        prompt: app?.prompt || app?.name || 'Regenerate',
        kind: 'regenerate',
        appId,
        retry: () => regenerateApp(appId),
      })
    } catch (err) {
      useShell.getState().pushToast('Could not regenerate', err instanceof Error ? err.message : 'failed')
    }
  })()
}

export function fixApp(appId: string, error: string): void {
  void (async () => {
    if (await blocked()) return
    try {
      const body = await postFix(appId, error)
      openPanel({
        jobId: body.jobId,
        prompt: error,
        kind: 'fix',
        appId,
        retry: () => fixApp(appId, error),
      })
    } catch (err) {
      useShell.getState().pushToast('Could not start a fix', err instanceof Error ? err.message : 'failed')
    }
  })()
}

export async function openGenerated(result: Extract<GenResult, { kind: 'app' }>, markFresh: boolean): Promise<void> {
  await useShell.getState().refreshApps()
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
  useShell.getState().openApp(result.appId)
}

export function noteRuntimeError(windowId: string, appId: string, version: number, message: string, appName: string): void {
  const mark = fresh.get(appId)
  if (!mark || mark.used || mark.version !== version) return
  if (Date.now() - mark.at > 10_000) return
  mark.used = true
  useShell.getState().setWindowError(windowId, null)
  const name = providerLabel(status.provider)
  useShell.getState().pushToast(`slopOS hit an error in ${appName} — ${name} is fixing it`)
  fixApp(appId, message)
}

export function cancelPanel(jobId: string): void {
  void postCancel(jobId).catch(() => undefined)
}

export function providerLabel(id?: string): string {
  if (id === 'codex') return 'Codex'
  if (id === 'claude') return 'Claude'
  if (id === 'mock') return 'Mock'
  return 'Grok'
}

export function jobActive(job: JobInfo): boolean {
  return job.state === 'queued' || job.state === 'running'
}
