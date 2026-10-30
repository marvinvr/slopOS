/** A single-shot screen answer: one json block (meta) and one html block (the screen). */
export type ScreenAnswer = { meta: Record<string, unknown> | null; html: string | null }

const FENCE = /```([a-zA-Z]*)[^\n]*\n/g

/**
 * Read the two fenced blocks. The html block runs to the last fence in the answer,
 * so a script with backticks inside it does not cut the screen short.
 */
export function parseScreenAnswer(text: string): ScreenAnswer {
  let meta: Record<string, unknown> | null = null
  let html: string | null = null
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
    if ((lang === 'html' || lang === 'htm') && html === null) {
      const jsonAfter = opens.find((item) => (item.index ?? 0) > start && item[1].toLowerCase() === 'json')
      const limit = jsonAfter ? (jsonAfter.index ?? text.length) : text.length
      const end = text.lastIndexOf('\n```', limit - 1)
      html = (end > start ? text.slice(start, end) : text.slice(start, limit)).trim()
    }
  }
  // No html fence: take the markup itself when the answer is plainly HTML.
  if (html === null) {
    const first = text.search(/<(!doctype|html|head|body|style|div|main|section|svg|canvas)\b/i)
    if (first >= 0) html = text.slice(first).replace(/\n```\s*$/, '').trim()
  }
  return { meta, html: html || null }
}
