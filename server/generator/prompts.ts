import type { GenKind } from './types'
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
  '{"name":"","icon":"","description":"","title":"","window":{"width":760,"height":520},"entities":[{"name":"","kind":"person|place|product|company|other","description":""}]}',
  '```',
  ...HTML_BLOCK,
  'name: the app, at most 20 characters. icon: a Lucide icon name in PascalCase (Timer, StickyNote, BookOpen). description: one calm sentence. title: this screen. window: a size that fits this screen. entities: only names you invented that should stay consistent later (may be empty).',
].join('\n')

const FORMAT_NEXT = [
  'Reply with exactly two fenced blocks and nothing else:',
  '```json',
  '{"title":"","entities":[]}',
  '```',
  ...HTML_BLOCK,
  'title: a short name for this screen. entities: only new names you invented (may be empty).',
].join('\n')

const SCREEN_RULES = [
  '## The screen',
  '- You render one screen of an app that runs in a window of slopOS, a warm, slightly playful take on macOS. The OS draws the window, its title bar and traffic lights; you fill the content area. The HTML goes inside <body>; no <html> or <head> needed.',
  '- Make it striking and a little surprising, something a person wants to screenshot, while it still clearly is this app: your own layout, palette, type, gradients, motion, SVG or canvas art, live details. Not a generic dashboard.',
  '- Realistic, specific content: names, numbers, dates, text. Never lorem ipsum, an empty list, or "coming soon".',
  '',
  '## Tools (all local, already loaded)',
  '- Tailwind CSS v4 (browser build): style with utility classes, including `dark:`, `hover:`, `animate-*`. `font-display` is a characterful serif, `font-mono` a mono, `text-accent`/`bg-accent` the OS accent.',
  '- Name your palette once instead of repeating hex values: `<style type="text/tailwindcss">@theme { --color-ink: #2a2118; --color-paper: #f3eadc; } .chip { @apply rounded-full px-3 py-1 text-xs; }</style>`, then `text-ink bg-paper chip`. Keyframes and gradients go in that block too.',
  '- Icons: `<i data-lucide="calendar-days" class="size-4"></i>` with any Lucide name, written literally.',
  '- Plain `<script>` for local life. For components and state, an ES module with React and htm (no JSX): `<script type="module">import { html, render, useState, useEffect } from \'/runtime/react.js\'; render(html`<${App}/>`, document.getElementById(\'app\'))</script>`. Use React only when the screen really needs state.',
  '- Sandbox: no network, no external URLs of any kind (scripts, fonts, images); draw with CSS, SVG, canvas, or emoji. No fetch, storage, or alert.',
  '',
  '## Interaction',
  '- You do not build navigation. The system catches clicks on links, buttons, `[role=button|tab|link|option|menuitem|switch]` and anything with `data-action`, Enter in an input, form submits, and changes of selects, checkboxes, radios and sliders. It sends that with the visible text and field values, and the next screen gets generated from it.',
  '- So every meaningful control must look real and be one of those elements. Put `data-action="what it does"` on clickable cards, rows and tiles, e.g. `data-action="Open the Lasagna recipe"`.',
  '- Controls your own script handles (play an animation, flip a card, a local toggle) get `data-local`, and the system leaves them alone.',
  '',
  '## Fit',
  '- `<html data-theme="light|dark">` follows the OS, and `dark:` follows it too. Either support both, or commit to one look of your own that reads well.',
  '- Fill the window (`min-h-screen`) and adapt to its size; long content scrolls.',
  '- Hard budget: about 3.5 KB of HTML (900 tokens). Fewer, bigger, bolder elements beat many small ones; a handful of rows says as much as twenty. Named colors and `@apply` for anything repeated, no comments.',
].join('\n')

/** The person's previous screen, trimmed so the prompt stays small. */
function clipHtml(html: string): string {
  if (html.length <= 16_000) return html
  const lean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script>/* omitted */</script>')
  return lean.length <= 16_000 ? lean : `${lean.slice(0, 16_000)}\n<!-- … -->`
}

export async function buildPrompt(request: PromptRequest): Promise<string> {
  const digest = await worldDigest({ appId: request.appId, intent: request.intent })
  const world = ['## World', 'Reuse these names and facts. Do not rename anything already here.', digest].join('\n')
  return [SCREEN_RULES, '', world, '', '## Task', taskBody(request)].join('\n')
}

function taskBody(request: PromptRequest): string {
  const current = request.currentHtml ? `\`\`\`html\n${clipHtml(request.currentHtml)}\n\`\`\`` : ''
  if (request.mode === 'view') {
    const screen = request.screen || {}
    const values = (screen.values || []).map((item) => `- ${item.field}: ${item.value}`).join('\n')
    return [
      `App: ${request.appName || request.appId || 'this app'}`,
      `The person is on the screen “${screen.title || 'Home'}”. Its HTML:`,
      current,
      screen.shown ? `What it showed:\n${screen.shown}` : '',
      values ? `Fields as they were filled in:\n${values}` : '',
      `They just did this: ${request.intent}`,
      '',
      'Render the screen that comes next, as this app would show it. Carry over every fact, name, and number the person has seen or typed, and reflect what they just did (a new item appears, a toggle stays on, a detail opens). Keep the visual identity of the screen above (palette, type, motifs) so it feels like the same app, and compose this screen freshly for what it shows.',
      'Every `<style>` block of the screen above (its theme colors, classes, keyframes) is loaded on your screen too: use them and do not repeat them; add only what is new.',
      'The window already shows a bar with back, forward, and this screen’s title above your screen. Do not draw a back button or repeat the title as a toolbar; start with the content.',
      '',
      FORMAT_NEXT,
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (request.mode === 'edit') {
    return [
      `App: ${request.appName || 'this app'}. This is its first screen:`,
      current,
      `Change it to follow this instruction: ${request.intent}`,
      'Keep what still fits. Return the whole new screen.',
      '',
      FORMAT_FIRST,
    ].join('\n')
  }
  return [
    `The person opened an app: ${request.intent}`,
    request.mode === 'regenerate' ? 'Design it afresh.' : '',
    'Render the first screen they see when it opens. Make it memorable and complete on its own.',
    '',
    FORMAT_FIRST,
  ]
    .filter(Boolean)
    .join('\n')
}
