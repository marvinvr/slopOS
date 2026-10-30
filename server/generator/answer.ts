/** A single-shot screen answer: one json block (meta) and one tsx block (source). */
export type ScreenAnswer = { meta: Record<string, unknown> | null; source: string | null }

const FENCE = /```([a-zA-Z]*)[^\n]*\n/g

/**
 * Read the two fenced blocks. The source block runs to the last fence in the answer,
 * so a template literal with backticks inside it does not cut the file short.
 */
export function parseScreenAnswer(text: string): ScreenAnswer {
  let meta: Record<string, unknown> | null = null
  let source: string | null = null
  const opens = [...text.matchAll(FENCE)]
  for (const open of opens) {
    const lang = open[1].toLowerCase()
    const start = (open.index ?? 0) + open[0].length
    if (lang === 'json' && !meta) {
      const end = text.indexOf('\n```', start)
      if (end < 0) continue
      try {
        const parsed = JSON.parse(text.slice(start, end))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed as Record<string, unknown>
      } catch {
        /* a broken meta block only loses the name and title */
      }
      continue
    }
    if (['tsx', 'jsx', 'ts', 'typescript', 'javascript', 'js'].includes(lang) && source === null) {
      const jsonAfter = opens.find((item) => (item.index ?? 0) > start && item[1].toLowerCase() === 'json')
      const limit = jsonAfter ? (jsonAfter.index ?? text.length) : text.length
      const end = text.lastIndexOf('\n```', limit - 1)
      source = (end > start ? text.slice(start, end) : text.slice(start, limit)).trim()
    }
  }
  if (source === null && /export\s+default\s+function/.test(text)) {
    source = text.replace(/^```[^\n]*\n|\n```\s*$/g, '').trim()
  }
  return { meta, source }
}
