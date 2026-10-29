import { useEffect, useState } from 'react'
import { useShell } from '../store'

export type GrokStatus = {
  available: boolean
  loggedIn?: boolean
  model?: string
  effort?: string
  reason?: string
}

/**
 * TODO(pass C): generation pipeline.
 * Replace these placeholders with the real job client:
 * POST /api/apps/generate, edit, regenerate, fix; stream GET /api/jobs/:id/events;
 * show progress in GenerationActivity; call refreshApps() when a job finishes.
 * Do not call the xAI API.
 */
export function useGrokStatus(): GrokStatus {
  const [status, setStatus] = useState<GrokStatus>({ available: false, reason: 'not implemented yet' })
  useEffect(() => {
    let cancel = false
    fetch('/api/health')
      .then((res) => res.json())
      .then((body: { grok?: GrokStatus }) => {
        if (!cancel && body.grok) setStatus(body.grok)
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [])
  return status
}

export function startGeneration(prompt: string): void {
  // TODO(pass C): POST /api/apps/generate { prompt }
  useShell.getState().pushToast("Generation isn't connected yet", prompt)
}

export function openEditApp(appId: string): void {
  // TODO(pass C): edit-with-prompt dialog, then POST /api/apps/:id/edit
  useShell.getState().pushToast("Generation isn't connected yet", `Edit ${appId}`)
}

export function regenerateApp(appId: string): void {
  // TODO(pass C): POST /api/apps/:id/regenerate
  useShell.getState().pushToast("Generation isn't connected yet", `Regenerate ${appId}`)
}

export function fixApp(appId: string, error: string): void {
  // TODO(pass C): POST /api/apps/:id/fix { error }
  useShell.getState().pushToast("Generation isn't connected yet", `${appId}: ${error}`)
}

export function GenerationActivity(): null {
  // TODO(pass C): menu-bar indicator while a job is running.
  return null
}
