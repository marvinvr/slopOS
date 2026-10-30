import { mockMs } from '../config'
import type { Availability, GenEvent, GeneratorProvider, RunOptions } from '../types'
import { sleep } from './util'

const manifest = (name: string, icon: string, description: string) => ({
  name,
  icon,
  description,
  window: { width: 440, height: 360, minWidth: 360, minHeight: 280, resizable: true },
})

function pomodoro(mark: string): string {
  return `<style>
  body { margin: 0; height: 100vh; display: grid; place-items: center; font-family: var(--slop-font); background: radial-gradient(circle at 30% 20%, #ffd9c7, var(--slop-bg) 60%); color: var(--slop-fg); }
  .dial { font: 600 64px/1 var(--slop-font-display); letter-spacing: -0.03em; animation: breathe 4s ease-in-out infinite; }
  @keyframes breathe { 50% { transform: scale(1.03); } }
  .row { display: flex; gap: 8px; margin-top: 18px; justify-content: center; }
  button { font: inherit; padding: 8px 16px; border-radius: 999px; border: 1px solid var(--slop-border); background: var(--slop-bg-elevated); color: inherit; }
  button.go { background: var(--slop-accent); color: white; border: 0; }
</style>
<!-- slop-mark ${mark} -->
<main>
  <div class="dial" id="dial">25:00</div>
  <div class="row"><button class="go">Start</button><button>Weekly streaks</button><button data-local id="wiggle">Wiggle</button></div>
</main>
<script>
  document.getElementById('wiggle').addEventListener('click', () => document.getElementById('dial').animate([{ rotate: '-3deg' }, { rotate: '3deg' }, { rotate: '0deg' }], 300))
</script>`
}

function todo(mark: string): string {
  return `<style>
  body { margin: 0; padding: 20px; font-family: var(--slop-font); background: var(--slop-bg); color: var(--slop-fg); }
  h1 { font: 600 28px var(--slop-font-display); margin: 0 0 12px; }
  li { padding: 8px 0; border-bottom: 1px solid var(--slop-border); }
</style>
<!-- slop-mark ${mark} -->
<nav data-nav="main"><a data-screen="today">Today</a> <a data-screen="done">Done</a></nav>
<h1>To-dos</h1>
<input aria-label="New task" placeholder="Add a task">
<ul><li data-action="Open Water the plants">Water the plants</li><li data-action="Open Call Ines">Call Ines</li></ul>
<button>Weekly streaks</button>`
}

/** A next screen keeps the shell and adds a section to it. */
function viewAnswer(prompt: string): string {
  const section = prompt.match(/opened the section “([a-z0-9-]+)”/)?.[1] || ''
  const html = `<style>h1 { font: 600 24px var(--slop-font-display); }</style>
<nav data-nav="main"><a data-screen="today">Today</a> <a data-screen="done">Done</a> <a data-screen="stats">Stats</a></nav>
<h1>Screen</h1>
<p>A generated screen.</p>
<a href="#more">Show more</a>`
  return answer({ title: section ? section.charAt(0).toUpperCase() + section.slice(1) : 'Screen', screen: section, entities: [] }, html)
}

/** The single-shot answer: meta json, then the screen. */
function answer(meta: Record<string, unknown>, html: string): string {
  return `\`\`\`json\n${JSON.stringify(meta)}\n\`\`\`\n\`\`\`html\n${html}\n\`\`\``
}

function appAnswer(prompt: string): string {
  const edited = /follow this instruction/i.test(prompt)
  const mark = edited ? 'v2' : 'v1'
  const timer = /pomodoro|\btimer\b/i.test(prompt.slice(prompt.indexOf('## Task')).split('\n')[1] || '')
  const meta = timer
    ? manifest('Pomodoro', 'Timer', 'A calm timer for one focused stretch.')
    : manifest('To-dos', 'ListTodo', 'A short list of what is left to do.')
  return answer({ ...meta, title: meta.name, screen: timer ? '' : 'today', entities: [] }, timer ? pomodoro(mark) : todo(mark))
}

export const mockProvider: GeneratorProvider = {
  id: 'mock',
  availability(): Promise<Availability> {
    return Promise.resolve({ available: true, loggedIn: true, model: 'mock', effort: 'mock' })
  },
  async *run(opts: RunOptions): AsyncIterable<GenEvent> {
    const step = Math.max(0, Math.round(mockMs() / 4))
    await sleep(step, opts.signal)
    if (opts.signal.aborted) return
    yield { type: 'thinking', text: 'Sketching a calm layout that fits the desktop.' }
    await sleep(step, opts.signal)
    if (opts.signal.aborted) return
    const output = opts.kind === 'view' ? viewAnswer(opts.prompt) : appAnswer(opts.prompt)
    await sleep(step, opts.signal)
    if (opts.signal.aborted) return
    yield { type: 'text', text: output }
    yield { type: 'end', output }
  },
}
