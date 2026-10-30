import { useSyncExternalStore } from 'react'
import { useShell } from '../store'
import { fetchJobs, postCancel, postEdit, postFix, postGenerate, postRegenerate, postRevert, type GenResult, type JobInfo } from './api'

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

export type WindowFix = {
  windowId: string
  appId: string
  appName: string
  jobId?: string
  status: string
}

type Snapshot = {
  status: GrokStatus
  jobs: JobInfo[]
  panel: PanelJob | null
  editAppId: string | null
  fixing: WindowFix | null
}

const listeners = new Set<() => void>()
let status: GrokStatus = { available: false, reason: 'Checking…' }
let jobs: JobInfo[] = []
let panel: PanelJob | null = null
let editAppId: string | null = null
let fixing: WindowFix | null = null
let statusAt = 0
let statusFlight: Promise<void> | null = null
// useSyncExternalStore bails the tree if getSnapshot returns a new object every call.
let snap: Snapshot = { status, jobs, panel, editAppId, fixing }

const fresh = new Map<string, { at: number; version: number; used: boolean }>()

function emit(): void {
  snap = { status, jobs, panel, editAppId, fixing }
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
  useShell.getState().pushToast(status.reason || `${providerLabel(status.provider) || 'The generator'} isn't available`)
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

export function beginWindowFix(windowId: string, appId: string, appName: string): void {
  if (fixing && fixing.appId === appId && fixing.windowId === windowId) return
  fixing = { windowId, appId, appName, status: 'Getting ready…' }
  emit()
}

export function noteFixProgress(jobId: string, text: string): void {
  if (!fixing) return
  if (fixing.jobId && fixing.jobId !== jobId) return
  const next = calmFixStatus(text)
  if (fixing.jobId === jobId && fixing.status === next) return
  fixing = { ...fixing, jobId, status: next }
  emit()
}

export function clearFixing(appId?: string): void {
  if (!fixing) return
  if (appId && fixing.appId !== appId) return
  fixing = null
  emit()
}

export function fixApp(appId: string, error: string): void {
  void (async () => {
    if (await blocked()) {
      clearFixing(appId)
      return
    }
    const shell = useShell.getState()
    const win = shell.windows.find((item) => item.appId === appId && item.phase !== 'closing' && shell.windowErrors[item.id])
    if (win && (!fixing || fixing.appId !== appId)) {
      const app = shell.apps.find((item) => item.id === appId)
      beginWindowFix(win.id, appId, app?.name || win.title)
    }
    try {
      const body = await postFix(appId, error)
      if (fixing && fixing.appId === appId && !fixing.jobId) fixing = { ...fixing, jobId: body.jobId }
      openPanel({
        jobId: body.jobId,
        prompt: error,
        kind: 'fix',
        appId,
        retry: () => fixApp(appId, error),
      })
    } catch (err) {
      clearFixing(appId)
      useShell.getState().pushToast('Could not start a fix', err instanceof Error ? err.message : 'failed')
    }
  })()
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
  clearFixing(result.appId)
  useShell.getState().openApp(result.appId)
}

export function noteRuntimeError(windowId: string, appId: string, version: number, message: string, appName: string): void {
  const mark = fresh.get(appId)
  if (!mark || mark.used || mark.version !== version) return
  if (Date.now() - mark.at > 10_000) return
  mark.used = true
  beginWindowFix(windowId, appId, appName)
  fixApp(appId, message)
}

export function cancelPanel(jobId: string): void {
  if (fixing?.jobId === jobId) clearFixing()
  void postCancel(jobId).catch(() => undefined)
}

/** Display name for the provider id reported by /api/health. Empty until that id is known. */
export function providerLabel(id?: string): string {
  if (id === 'codex') return 'Codex'
  if (id === 'claude') return 'Claude'
  if (id === 'mock') return 'Mock'
  if (id === 'grok') return 'Grok'
  return ''
}

export function jobActive(job: JobInfo): boolean {
  return job.state === 'queued' || job.state === 'running'
}

function calmFixStatus(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (!line || line.startsWith('{') || line.startsWith('[')) return 'Sketching…'
  if (line === 'Queued') return 'Getting ready…'
  if (line === 'Thinking') return 'Thinking…'
  if (line === 'Compiling' || line === 'Fixing the response' || /^Fixing compile error\b/i.test(line)) return 'Putting it together…'
  if (/^write\b/i.test(line)) return 'Writing…'
  return line.length > 96 ? `${line.slice(0, 95).trim()}…` : line
}
