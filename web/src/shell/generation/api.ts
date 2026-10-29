export type GenResult =
  | { kind: 'content'; data: unknown }
  | { kind: 'view'; viewId: string; appId: string }
  | { kind: 'app'; appId: string; name?: string; version?: number }

export type JobEvent =
  | { type: 'status'; text: string; step?: string; seq?: number }
  | { type: 'thinking'; text: string; seq?: number }
  | { type: 'text'; text: string; seq?: number }
  | { type: 'tool'; text: string; seq?: number }
  | { type: 'log'; text: string; seq?: number }
  | { type: 'done'; result?: GenResult; seq?: number }
  | { type: 'error'; message: string; auth?: boolean; seq?: number }

export type JobInfo = {
  id: string
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  kind: string
  prompt: string
  appId?: string
  createdAt: string
  error?: string
}

async function post(url: string, body?: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; jobId?: string }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export function postGenerate(prompt: string): Promise<{ jobId: string }> {
  return post('/api/apps/generate', { prompt }) as Promise<{ jobId: string }>
}

export function postEdit(appId: string, prompt: string): Promise<{ jobId: string }> {
  return post(`/api/apps/${appId}/edit`, { prompt }) as Promise<{ jobId: string }>
}

export function postRegenerate(appId: string): Promise<{ jobId: string }> {
  return post(`/api/apps/${appId}/regenerate`) as Promise<{ jobId: string }>
}

export function postFix(appId: string, error: string): Promise<{ jobId: string }> {
  return post(`/api/apps/${appId}/fix`, { error }) as Promise<{ jobId: string }>
}

export function postRevert(appId: string, version: number): Promise<void> {
  return post(`/api/apps/${appId}/revert`, { version }) as Promise<void>
}

export function postCancel(jobId: string): Promise<void> {
  return post(`/api/jobs/${jobId}/cancel`) as Promise<void>
}

export async function fetchJobs(): Promise<JobInfo[]> {
  const res = await fetch('/api/jobs')
  if (!res.ok) return []
  const data = (await res.json()) as JobInfo[]
  return Array.isArray(data) ? data : []
}

export async function streamJobEvents(jobId: string, onEvent: (event: JobEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch(`/api/jobs/${jobId}/events`, { signal })
  if (!res.ok || !res.body) throw new Error('The event stream did not open')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      const line = part.split('\n').find((item) => item.startsWith('data: '))
      if (!line) continue
      try {
        onEvent(JSON.parse(line.slice(6)) as JobEvent)
      } catch {
        /* ignore a partial frame */
      }
    }
  }
}
