import { useEffect } from 'react'
import { EditDialog } from './EditDialog'
import { streamJobEvents } from './api'
import { cancelBuild, dropBuild, failBuild, finishBuild, noteRuntimeError, refreshJobs, refreshStatus, useGeneration, type Build } from './state'
import { useShell } from '../store'

/** Keeps the job poll, one watcher per building window, the edit dialog, and the one-shot runtime fix. */
export function GenerationActivity() {
  const { builds, editAppId } = useGeneration()
  const windows = useShell((state) => state.windows)
  const errors = useShell((state) => state.windowErrors)
  const apps = useShell((state) => state.apps)

  useEffect(() => {
    void refreshStatus(true)
    void refreshJobs()
    const timer = window.setInterval(() => {
      void refreshStatus()
      void refreshJobs()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    for (const win of windows) {
      const error = errors[win.id]
      if (!error) continue
      const app = apps.find((item) => item.id === win.appId)
      if (!app || app.fixture) continue
      const message = error.stack ? `${error.message}\n${error.stack}` : error.message
      noteRuntimeError(win.id, win.appId, win.version, message)
    }
  }, [apps, errors, windows])

  // Closing a window that is still opening stops its job. Changes to an existing app keep going.
  useEffect(() => {
    for (const build of builds) {
      if (windows.some((win) => win.id === build.windowId && win.phase !== 'closing')) continue
      if (build.kind === 'create') cancelBuild(build.windowId)
      else if (!build.jobId) dropBuild(build.windowId)
    }
  }, [builds, windows])

  return (
    <>
      {builds.map((build) => (build.jobId ? <BuildWatcher key={build.jobId} build={build} /> : null))}
      {editAppId ? <EditDialog appId={editAppId} /> : null}
    </>
  )
}

function BuildWatcher({ build }: { build: Build }) {
  const { windowId, jobId } = build

  useEffect(() => {
    if (!jobId) return
    const abort = new AbortController()
    let settled = false
    streamJobEvents(
      jobId,
      (event) => {
        if (settled) return
        if (event.type === 'done') {
          settled = true
          void finishBuild(windowId, event.result)
        } else if (event.type === 'error') {
          settled = true
          failBuild(windowId)
        }
      },
      abort.signal,
    )
      .then(() => {
        if (!settled && !abort.signal.aborted) failBuild(windowId)
      })
      .catch(() => {
        if (!abort.signal.aborted) failBuild(windowId)
      })
    return () => abort.abort()
  }, [jobId, windowId])

  return null
}
