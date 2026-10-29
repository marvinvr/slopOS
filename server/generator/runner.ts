import type { GeneratorProvider, GenEvent, RunOptions } from './types'

const THINK_MS = 250

/** Run a provider and throttle thinking lines so the UI ticker stays calm. */
export async function* runProvider(provider: GeneratorProvider, opts: RunOptions): AsyncIterable<GenEvent> {
  let pending = ''
  let last = 0
  const flush = function* (): Generator<GenEvent> {
    const text = lastLine(pending)
    pending = ''
    if (text) yield { type: 'thinking', text }
  }
  for await (const event of provider.run(opts)) {
    if (event.type === 'thinking') {
      pending = event.text
      const now = Date.now()
      if (now - last >= THINK_MS) {
        last = now
        yield* flush()
      }
      continue
    }
    if (pending) {
      last = Date.now()
      yield* flush()
    }
    if (event.type === 'tool') {
      yield { type: 'tool', text: friendlyTool(event.text) }
      continue
    }
    yield event
  }
  if (pending) yield* flush()
}

function lastLine(text: string): string {
  const line = text
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .pop()
  return (line || '').slice(0, 180)
}

export function friendlyTool(text: string): string {
  const file = text.match(/([A-Za-z0-9_.-]+\.tsx)/)?.[1]
  const base = file ? file.split('/').pop() : ''
  if (base && /write|edit|replace|search_replace/i.test(text)) return `Writing ${base}`
  if (base && /read/i.test(text)) return `Reading ${base}`
  if (/list_dir|list dir/i.test(text)) return 'Looking through the workspace'
  return text.replace(/\s+/g, ' ').trim().slice(0, 160)
}
