import type { GenKind } from './types'
import { navBlocks, type AppShell } from '../apps/shell'
import { worldDigest } from './world'

export type PromptRequest = {
  kind: GenKind
  mode: 'create' | 'edit' | 'regenerate' | 'view'
  intent: string
  appId?: string
  appName?: string
  /** The screen the person is looking at (edit: the first screen; view: the one they acted on). */
  currentHtml?: string
  /** View only: what the screen showed and what was typed, as captured by the runtime. */
  screen?: { title?: string; shown?: string; values?: { field: string; value: string }[] }
  /** View only: the app's accumulated shell, the section the person is on, and the section they opened. */
  shell?: AppShell
  section?: string
  target?: string
}

/** System prompt for screen turns. The answer is text; nothing is written by the model. */
export const SCREEN_SYSTEM_PROMPT = [
  'You design one screen of a desktop app at a time and answer with its HTML.',
  'Do not use tools, read files, or write files. Reply with exactly the two fenced blocks the task asks for, nothing else.',
].join('\n')

const HTML_BLOCK = ['```html', '…the screen: markup with Tailwind classes, optional <style> and <script>…', '```']

const FORMAT_FIRST = [
  'Reply with exactly two fenced blocks and nothing else:',
  '```json',
  '{"name":"","icon":"","description":"","title":"","screen":"","window":{"width":900,"height":600},"entities":[{"name":"","kind":"person|place|product|company|other","description":""}]}',
  '```',
  ...HTML_BLOCK,
  'name: the app, at most 20 characters. icon: a Lucide icon name in PascalCase (Timer, StickyNote, BookOpen). description: one calm sentence. title: this screen. screen: the slug of the section this screen is (the `data-screen` its nav entry uses, e.g. "today"). window: a size that fits the app. entities: names you invented that should stay consistent later.',
].join('\n')

const FORMAT_NEXT = [
  'Reply with exactly two fenced blocks and nothing else:',
  '```json',
  '{"title":"","screen":"","entities":[]}',
  '```',
  ...HTML_BLOCK,
  'title: a short name for this screen. screen: the slug of the section this screen is, or empty for a one-off view. entities: new names you invented.',
].join('\n')

const SCREEN_RULES = [
  '## The app',
  '- You build a real desktop app for slopOS, a warm, slightly playful take on macOS, one screen at a time. The OS draws the window and its title bar (with back, forward and the screen title); you fill the content area. The HTML goes inside <body>; no <html> or <head> needed.',
  '- Make the best screen you can: polished and ambitious, like the flagship app of a great product team. Give the app its own visual identity, chosen for what it is: palette, type pairing, iconography, illustration and motion. Avoid the generic admin-dashboard look.',
  '- Rich content that feels lived in: specific names, numbers, dates, prose, states (unread counts, progress, timestamps, initials avatars, charts and art drawn in SVG). Enough of it that the app feels in use. Never lorem ipsum, placeholders, or "coming soon".',
  '- Thoughtful layout: a clear hierarchy and a focal point; density where it helps (lists, tables, inspectors), air where it matters.',
  '- Details and micro-interactions: hover and focus states, transitions, small animated touches, live clocks or counters, keyboard hints, panels that switch locally. Your own script handles local behavior.',
  '',
  '## The app shell',
  '- The app keeps one shell on every screen: a sidebar, tab bar, or header with its sections, whatever suits it. Put each nav region in an element with `data-nav="main"` (a second region gets its own name, e.g. `data-nav="tabs"`). Plain markup inside, no scripts.',
  '- Nav entries link to sections by a stable short slug: `<a data-screen="inbox">Inbox</a>`. The system marks the current one with `aria-current="page"`; style it with `aria-[current=page]:` classes. Sections you list do not need to exist yet; each is built when first opened and stays reachable.',
  '',
  '## Tools (all local, already loaded)',
  '- Tailwind CSS v4 (browser build): style with utility classes, including `dark:`, `hover:`, `group-*`, `animate-*`. `font-display` is a characterful serif, `font-mono` a mono, `text-accent`/`bg-accent` the OS accent.',
  '- Define the app\'s design system once: `<style type="text/tailwindcss">@theme { --color-ink: #2a2118; --color-paper: #f3eadc; } .chip { @apply rounded-full px-3 py-1 text-xs; }</style>`, then `text-ink bg-paper chip`. Keyframes, gradients, and component classes go there too. Every screen of the app loads these blocks.',
  '- Icons: `<i data-lucide="calendar-days" class="size-4"></i>` with any Lucide name, written literally.',
  '- Plain `<script>` for local life. For components and state, an ES module with React and htm (no JSX): `<script type="module">import { html, render, useState, useEffect } from \'/runtime/react.js\'; render(html`<${App}/>`, document.getElementById(\'app\'))</script>`.',
  '- Sandbox: no network, no external URLs of any kind (scripts, fonts, images); draw with CSS, SVG, canvas, or emoji. No fetch, storage, or alert.',
  '',
  '## Interaction',
  '- You do not build navigation. The system catches clicks on links, buttons, `[role=button|tab|link|option|menuitem|switch]` and anything with `data-action`, Enter in an input, form submits, and changes of selects, checkboxes, radios and sliders. It sends that with the visible text and field values, and the next screen gets built from it. While it is on its way, the clicked control shows that it is loading.',
  '- So every meaningful control must look real and be one of those elements. Put `data-action="what it does"` on clickable cards, rows and tiles, e.g. `data-action="Open the Lasagna recipe"`, and `data-screen="slug"` on anything that opens a section.',
  '- Controls your own script handles (switch a panel, play an animation, flip a card, a local toggle) get `data-local`, and the system leaves them alone.',
  '',
  '## Fit',
  '- `<html data-theme="light|dark">` follows the OS, and `dark:` follows it too. Either support both, or commit to one look of your own that reads well.',
  '- Fill the window (`min-h-screen`) and adapt to its size; long content scrolls.',
  '- Size: no hard limit, quality comes first. Keep the markup lean so it arrives quickly: named colors and component classes for anything repeated, no comments.',
].join('\n')

/** The person's previous screen, trimmed so the prompt stays small. Shared styles and nav regions are listed once on their own. */
function clipHtml(html: string, shell?: AppShell): string {
  let out = html
  if (shell) {
    for (const block of shell.styles) out = out.split(block).join('')
    for (const [name, nav] of Object.entries(navBlocks(out))) out = out.split(nav).join(`<!-- the "${name}" nav region, as above -->`)
    out = out.trim()
  }
  if (out.length <= 16_000) return out
  const lean = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script>/* omitted */</script>')
  return lean.length <= 16_000 ? lean : `${lean.slice(0, 16_000)}\n<!-- … -->`
}

/** The app so far: its sections, shared styles, and nav regions. */
function appSoFar(shell: AppShell, section?: string): string {
  const sections = Object.entries(shell.sections)
    .slice(-16)
    .map(([slug, item]) => {
      const how = item.intent ? ` — opened by: ${item.intent}` : ' — the first screen'
      return `- ${slug} “${item.title}”${slug === section ? ' (the screen they are on)' : ''}${how}\n  shows: ${item.summary}`
    })
  let styles = shell.styles.join('\n')
  if (styles.length > 10_000) styles = `${styles.slice(-10_000)}`
  const navs = Object.entries(shell.navs).map(([name, html]) => `\`data-nav="${name}"\`:\n\`\`\`html\n${html.length > 5000 ? `${html.slice(0, 5000)}…` : html}\n\`\`\``)
  return [
    '## The app so far',
    sections.length ? `Sections built so far:\n${sections.join('\n')}` : 'No named sections yet.',
    styles ? `Its design system, loaded on every screen (use these colors and classes; do not repeat them, add only what is new):\n\`\`\`html\n${styles}\n\`\`\`` : '',
    navs.length ? `Its shell, the nav regions every screen carries (newest version):\n${navs.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function buildPrompt(request: PromptRequest): Promise<string> {
  const digest = await worldDigest({ appId: request.appId, intent: request.intent })
  const world = ['## World', 'Reuse these names and facts. Do not rename anything already here.', digest].join('\n')
  return [SCREEN_RULES, '', world, '', '## Task', taskBody(request)].join('\n')
}

function taskBody(request: PromptRequest): string {
  const current = request.currentHtml ? `\`\`\`html\n${clipHtml(request.currentHtml, request.mode === 'view' ? request.shell : undefined)}\n\`\`\`` : ''
  if (request.mode === 'view') {
    const screen = request.screen || {}
    const values = (screen.values || []).map((item) => `- ${item.field}: ${item.value}`).join('\n')
    const target = request.target
      ? `They opened the section “${request.target}”. Build that section as a full part of the app, and set "screen" to "${request.target}".`
      : 'If this screen is a new section of the app (a place that belongs in the nav), give it a slug in "screen" and add its entry to the nav. If it is a view of one thing (an item, a form, a result), it can stay a one-off with an empty "screen", or get a slug like "recipe-lasagna" when it is worth coming back to.'
    return [
      `App: ${request.appName || request.appId || 'this app'}. It grows with every click: one coherent app, and the screen you build is its next part.`,
      '',
      request.shell ? appSoFar(request.shell, request.section) : '',
      '',
      `## Where they are\nThe screen “${screen.title || 'Home'}”. Its HTML:`,
      current,
      screen.shown ? `What it showed:\n${screen.shown}` : '',
      values ? `Fields as they were filled in:\n${values}` : '',
      `They just did this: ${request.intent}`,
      '',
      '## What to build',
      'The screen that comes next, as this app would show it.',
      '- Keep the shell: the same nav regions with the same `data-nav` names, markup, classes and order, plus any new entries; never drop one. The header and frame stay the same too, so it reads as the same app.',
      `- ${target}`,
      '- Build the app out: this screen goes deeper than the last, with its own layout, new detail, and real data. Every fact, name, and number the person has seen or typed stays true, and what they just did shows (a new item appears, a toggle stays on, a detail opens).',
      '- Use the design system above; add to it only what is new.',
      '- The window’s title bar already shows back, forward, and this screen’s title. Do not draw a back button.',
      '',
      FORMAT_NEXT,
    ]
      .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
      .join('\n')
  }
  if (request.mode === 'edit') {
    return [
      `App: ${request.appName || 'this app'}. This is its first screen:`,
      current,
      `Change it to follow this instruction: ${request.intent}`,
      'Keep what still fits, including its shell (the `data-nav` regions). Return the whole new screen.',
      '',
      FORMAT_FIRST,
    ].join('\n')
  }
  return [
    `The person opened an app: ${request.intent}`,
    request.mode === 'regenerate' ? 'Design it afresh.' : '',
    'Build the first screen they see when it opens, with the app shell the rest of the app will grow into. Make it memorable and complete on its own.',
    '',
    FORMAT_FIRST,
  ]
    .filter(Boolean)
    .join('\n')
}
