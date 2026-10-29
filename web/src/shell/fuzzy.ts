/** A prefix or word-start is "good". A loose subsequence is only a hint. */
export const GOOD_MATCH = 160

export function scoreText(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const t = text.toLowerCase()
  if (!t) return 0
  if (t === q) return 1000
  let score = 0
  if (t.startsWith(q)) score = Math.max(score, 820)
  for (const word of t.split(/[^a-z0-9]+/)) {
    if (word.startsWith(q)) score = Math.max(score, 640)
  }
  let qi = 0
  let streak = 0
  let sub = 0
  let prev = -2
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] !== q[qi]) {
      streak = 0
      continue
    }
    streak = i === prev + 1 ? streak + 1 : 1
    sub += 12 + streak * 6
    if (i === 0 || /[^a-z0-9]/.test(t[i - 1]!)) sub += 10
    prev = i
    qi++
  }
  if (qi === q.length) score = Math.max(score, sub)
  return score
}

export function scoreApp(query: string, name: string, description?: string): number {
  if (!query.trim()) return 1
  const nameScore = scoreText(query, name)
  const descScore = description ? scoreText(query, description) * 0.45 : 0
  if (nameScore === 0 && descScore === 0) return 0
  return nameScore + descScore
}
