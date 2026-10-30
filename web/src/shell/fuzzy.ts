/** A prefix, word-start, or substring is "good". A tight short fuzzy match is too. */
export const GOOD_MATCH = 160

/**
 * Exact, then prefix, then word-start, then substring.
 * Scattered letters count only for a short query whose hits stay within two characters of each other.
 */
export function scoreText(query: string, text: string, fuzzy = true): number {
  const direct = wordScore(query, text)
  if (direct) return direct
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  if (q.length >= 2 && t.includes(q)) return 480
  if (!fuzzy) return 0
  return tightFuzzy(q, t)
}

export function scoreApp(query: string, name: string, description?: string): number {
  const q = query.trim()
  if (!q) return 1
  const nameScore = scoreText(q, name)
  // A description hit has to be a word, not two letters buried in "contract".
  const descScore = description && q.length >= 2 ? wordScore(q, description) * 0.45 : 0
  if (nameScore === 0 && descScore === 0) return 0
  return nameScore + descScore
}

/** Exact, prefix, or the start of a word. An empty query matches so the full list still shows. */
function wordScore(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const t = text.toLowerCase()
  if (!t) return 0
  if (t === q) return 1000
  if (t.startsWith(q)) return 820
  const words = t.split(/[^a-z0-9]+/)
  if (words.some((word) => word.startsWith(q))) return 640
  return 0
}

/** Short query only. Each next letter is at most two characters past the previous hit. */
function tightFuzzy(q: string, t: string): number {
  if (q.length < 2 || q.length > 3) return 0
  let best = 0
  for (let start = 0; start < t.length; start++) {
    if (t[start] !== q[0]) continue
    let prev = start
    let streak = 1
    let bestStreak = 1
    let ok = true
    for (let qi = 1; qi < q.length; qi++) {
      const ch = q[qi]
      let found = -1
      const end = Math.min(t.length - 1, prev + 3)
      for (let i = prev + 1; i <= end; i++) {
        if (t[i] === ch) {
          found = i
          break
        }
      }
      if (found < 0) {
        ok = false
        break
      }
      streak = found === prev + 1 ? streak + 1 : 1
      if (streak > bestStreak) bestStreak = streak
      prev = found
    }
    if (!ok) continue
    const boundary = start === 0 || /[^a-z0-9]/.test(t[start - 1] || '')
    const score = 200 + bestStreak * 30 + (boundary ? 40 : 0)
    if (score > best) best = score
  }
  return best
}
