import { useEffect } from 'react'
import { EditDialog } from './EditDialog'
import { GenerationPanel } from './Panel'
import { noteRuntimeError, refreshJobs, refreshStatus, useGeneration } from './state'
import { useShell } from '../store'

/** Keeps the job poll, the panel, the edit dialog, and the one-shot runtime fix. The status icon lives in the menu bar. */
export function GenerationActivity() {
  const { panel, editAppId } = useGeneration()
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
      noteRuntimeError(win.id, win.appId, win.version, message, app.name)
    }
  }, [apps, errors, windows])

  return (
    <>
      {panel ? <GenerationPanel key={panel.jobId} panel={panel} /> : null}
      {editAppId ? <EditDialog appId={editAppId} /> : null}
    </>
  )
}
