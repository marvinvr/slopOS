import type { GeneratorProvider, GenEvent, RunOptions } from './types'

const RATE_MS = 1500
const STAGES = ['Sketching the layout…', 'Writing the screen…', 'Polishing details…'] as const

/**
 * Turn thinking and text deltas into calm status lines.
 * Fragments, code, and JSON stay off the ticker. A stage line fills the gap.
 */
export async function* runProvider(provider: GeneratorProvider, opts: RunOptions): AsyncIterable<GenEvent> {
  const narrator = createNarrator()
  for await (const event of provider.run(opts)) {
    if (event.type === 'thinking' || event.type === 'text') {
      const line = narrator.push(event.text)
      if (line) yield { type: 'thinking', text: line }
      continue
    }
    if (event.type === 'tool') {
      const text = friendlyTool(event.text)
      yield { type: 'tool', text }
      const line = narrator.tool(text)
      if (line) yield { type: 'thinking', text: line }
      continue
    }
    yield event
  }
  const tail = narrator.finish()
  if (tail) yield { type: 'thinking', text: tail }
}

const CODE_MARK = /[{}[\]<>`]|=>|<\/|\/\*|\*\/|^\s*(\/\/|import\b|export\b|const\b|let\b|function\b|return\b|type\b|interface\b|class\b)/

/** A status line a person can read. Code, JSON, markup, and tiny fragments return null. */
export function calmLine(raw: string): string | null {
  let text = raw.replace(/\s+/g, ' ').replace(/^[-*•#>\s]+/, '').replace(/^\d+[.)]\s+/, '').trim()
  text = text.replace(/^["'`]+|["'`]+$/g, '').trim()
  if (!text || looksLikeCode(text)) return null
  if (text.length < 12) return null
  if (text.length > 70) {
    const cut = text.slice(0, 70)
    const space = cut.lastIndexOf(' ')
    text = (space >= 24 ? cut.slice(0, space) : cut).replace(/[,\s;:]+$/, '')
    if (!/[.!?…]$/.test(text)) text += '…'
  }
  if (text.length < 12 || looksLikeCode(text)) return null
  return text
}

function looksLikeCode(text: string): boolean {
  if (CODE_MARK.test(text)) return true
  const quotes = text.match(/["'`]/g)?.length ?? 0
  if (quotes >= 2 && /[:,]/.test(text)) return true
  const symbols = text.replace(/[\w\s.,'’"!?…:;()-]/g, '')
  return symbols.length / text.length > 0.12
}

function drain(buffer: string): { phrases: string[]; rest: string } {
  const marks = [...buffer.matchAll(/[.!?…](?:\s|$)|\n/g)]
  if (!marks.length) {
    if (buffer.length > 48 && looksLikeCode(buffer)) return { phrases: [], rest: '' }
    if (buffer.length > 120) {
      const line = calmLine(buffer)
      return { phrases: line ? [line] : [], rest: '' }
    }
    return { phrases: [], rest: buffer }
  }
  const last = marks[marks.length - 1]
  const end = (last.index ?? 0) + last[0].length
  const phrases: string[] = []
  for (const bit of buffer.slice(0, end).split(/\n+/)) {
    for (const sentence of bit.split(/(?<=[.!?…])\s+/)) {
      const line = calmLine(sentence)
      if (line) phrases.push(line)
    }
  }
  return { phrases, rest: buffer.slice(end) }
}

function createNarrator() {
  let buffer = ''
  let held: string | null = null
  let lastEmit = 0
  let shown = ''
  let wrote = false
  let polished = false

  const stage = () => (wrote && polished ? STAGES[2] : wrote ? STAGES[1] : STAGES[0])

  const emit = (now: number): string | null => {
    const line = held || stage()
    if (!line || line === shown) {
      if (held === shown) held = null
      return null
    }
    if (shown && now - lastEmit < RATE_MS) return null
    held = null
    shown = line
    lastEmit = now
    return line
  }

  return {
    push(delta: string): string | null {
      buffer = (buffer + delta).slice(-4000)
      const pulled = drain(buffer)
      buffer = pulled.rest
      if (pulled.phrases.length) held = pulled.phrases[pulled.phrases.length - 1]
      if (wrote) polished = true
      return emit(Date.now())
    },
    tool(text: string): string | null {
      if (text.startsWith('Writing ')) {
        wrote = true
        polished = false
        if (!held) held = STAGES[1]
      }
      return emit(Date.now())
    },
    finish(): string | null {
      const pulled = drain(`${buffer}\n`)
      if (pulled.phrases.length) held = pulled.phrases[pulled.phrases.length - 1]
      buffer = ''
      return emit(Date.now())
    },
  }
}

export function friendlyTool(text: string): string {
  const file = text.match(/([A-Za-z0-9_.-]+\.(?:tsx|json))/i)?.[1]
  const base = file ? file.split('/').pop() : ''
  const writing = /write|edit|replace|search_replace/i.test(text)
  if (writing && base) return `Writing ${base}`
  if (writing) return 'Writing the screen…'
  if (base && /read/i.test(text)) return `Reading ${base}`
  if (/list_dir|list dir|^search\b/i.test(text)) return 'Looking through the workspace'
  return calmLine(text) || 'Working on the screen'
}
