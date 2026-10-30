import type { GenKind } from './types'
import { worldDigest } from './world'

export type PromptRequest = {
  kind: GenKind
  mode: 'create' | 'edit' | 'regenerate' | 'fix' | 'view' | 'content'
  intent: string
  appId?: string
  appName?: string
  errorText?: string
  attempt?: number
  schema?: Record<string, unknown>
  /** The screen the person is looking at (create/edit/fix: the first screen; view: the one they acted on). */
  currentSource?: string
  /** View only: what the screen showed and what was typed, as captured by the runtime. */
  screen?: { title?: string; shown?: string; values?: { field: string; value: string }[] }
}

export const JSON_SESSION_RULES = 'Do not use tools. Do not write files. Reply with one JSON value and no markdown.'

/** System prompt for screen turns. The answer is text; nothing is written by the model. */
export const SCREEN_SYSTEM_PROMPT = [
  'You design one screen of a desktop app at a time and answer with its source.',
  'Do not use tools, read files, or write files. Reply with exactly the two fenced blocks the task asks for, nothing else.',
].join('\n')

const FORMAT_FIRST = [
  'Reply with exactly two fenced blocks and nothing else:',
  '```json',
  '{"name":"","icon":"","description":"","title":"","window":{"width":760,"height":520},"entities":[{"name":"","kind":"person|place|product|company|other","description":""}]}',
  '```',
  '```tsx',
  'import { … } from \'@slop/sdk\'',
  'export default function App() { … }',
  '```',
  'name: the app, at most 20 characters. icon: a Lucide icon name in PascalCase (Timer, StickyNote, BookOpen). description: one calm sentence. title: this screen. window: a size that fits this screen. entities: only names you invented that should stay consistent later (may be empty).',
].join('\n')

const FORMAT_NEXT = [
  'Reply with exactly two fenced blocks and nothing else:',
  '```json',
  '{"title":"","entities":[]}',
  '```',
  '```tsx',
  'import { … } from \'@slop/sdk\'',
  'export default function View() { … }',
  '```',
  'title: a short name for this screen. entities: only new names you invented (may be empty).',
].join('\n')

const SCREEN_RULES = [
  '## How screens work',
  '- You render one screen: what the window shows right now. Do not plan other screens, routes, or navigation.',
  '- The screen is static. Do not write event handlers, state, effects, timers, or data loading. No `onClick`, `onChange`, `onSubmit`, `useState`, `useEffect`.',
  '- Every click, Enter, toggle, selection, and submit on the screen is caught by the system, which then asks for the screen that comes next. So make every control look real and clickable: buttons, list rows, tabs, chips, links, inputs with placeholders. Give icon buttons a `label`.',
  '- Fill it with realistic, specific content (names, numbers, dates, text). Never an empty list, a placeholder paragraph, or "coming soon".',
  '- A single file. Imports only from `@slop/sdk` (and `react` if you need a type). No other packages, no CSS files, no `<style>` blocks, no `fetch`.',
  '',
  '## Look',
  '- A warm, calm, slightly playful reading of macOS. Polished and native, never flashy, neon, or glassy.',
  '- Use kit components first. Inline styles only with `var(--slop-…)` tokens.',
  '- Layouts that feel native: `<Toolbar title>` over `<ScrollArea grow>` inside `<Stack fill gap={0}>`; or `<SplitView sidebar={<List>…</List>}>` for a list and its detail; or a centered utility (`Stack fill align="center" justify="center"`) with one `Stat` and one primary button.',
  '- The accent (tangerine) once per screen: the primary button, the selected row, or one badge. One `Stat` display number per screen at most.',
  '- Pad content with `padding={20}` or `16`. Gaps of 8 or 12. The root fills the window.',
  '',
  '## Kit (import from @slop/sdk)',
  '- Layout: `Stack` (column) and `Row` take `gap`, `align`, `justify`, `padding`, `fill`, `grow`; `Row` also `wrap`. `Grid` takes `columns` or `minChildWidth`, `gap`. `ScrollArea grow`. `SplitView sidebar sidebarWidth`. `Section title description`. `Card padding` (add `intent="…"` to make a card clickable). `Divider`.',
  '- Bars: `Toolbar title leading trailing`. `Tabs tabs=[{value,label}] value`. `SegmentedControl options=[{value,label}] value`.',
  '- Text: `Heading level={1|2|3}`, `Text muted size="xs|sm|md|lg"`, `Stat value label size="lg|md"`, `Badge tone="neutral|accent|danger|success|warning"`, `Tag tone`, `Kbd`, `Avatar name`, `Icon name size`.',
  '- Lists: `List` of `ListItem title subtitle icon trailing selected`. `Table rows columns=[{key,header,align,render}] rowKey`. `EmptyState icon title description action`.',
  '- Controls: `Button variant="primary|secondary|ghost|danger" size="sm|md"`, `IconButton icon label`, `Link`, `Chip selected square current`, `Input placeholder defaultValue`, `TextArea placeholder rows defaultValue`, `SearchField placeholder`, `Select options defaultValue`, `Checkbox label checked`, `Switch label checked`, `Slider defaultValue min max`, `NumberInput defaultValue`, `Field label hint`, `ProgressBar value max label`, `ColorSwatch value`.',
  '- Tokens: `--slop-fg`, `--slop-fg-muted`, `--slop-fg-subtle`, `--slop-bg`, `--slop-bg-elevated`, `--slop-bg-sunken`, `--slop-border`, `--slop-accent`, `--slop-accent-soft`, `--slop-success|danger|warning` (and `-soft`), `--slop-radius-md|lg`, `--slop-space-1…8`, `--slop-text-xs…2xl`, `--slop-font-mono`.',
].join('\n')

export async function buildPrompt(request: PromptRequest): Promise<{ prompt: string }> {
  const digest = await worldDigest({ appId: request.appId, intent: request.intent })
  const world = ['## World', 'Reuse these names and facts. Do not rename anything already here.', digest].join('\n')
  if (request.mode === 'content') {
    const prompt = [
      `You write content for a desktop app. ${JSON_SESSION_RULES}`,
      '',
      world,
      '',
      '## Task',
      request.schema ? `JSON schema:\n${JSON.stringify(request.schema)}` : 'Reply with a JSON object.',
      request.attempt && request.attempt > 1 ? 'The previous answer was invalid. Reply with valid JSON only.' : '',
      `Intent: ${request.intent}`,
    ]
      .filter(Boolean)
      .join('\n')
    return { prompt }
  }
  const prompt = [SCREEN_RULES, '', world, '', '## Task', taskBody(request)].join('\n')
  return { prompt }
}

/** The repair turn resumes the same session, so it only carries the errors. */
export function repairPrompt(errors: string, kind: 'app' | 'view'): string {
  return [
    'That source did not compile:',
    errors,
    '',
    `Reply again with both fenced blocks, the json and the complete corrected ${kind === 'view' ? 'View' : 'App'} source. Keep the same screen.`,
  ].join('\n')
}

function taskBody(request: PromptRequest): string {
  const current = request.currentSource ? `\`\`\`tsx\n${request.currentSource}\n\`\`\`` : ''
  if (request.mode === 'view') {
    const screen = request.screen || {}
    const values = (screen.values || []).map((item) => `- ${item.field}: ${item.value}`).join('\n')
    return [
      `App: ${request.appName || request.appId || 'this app'}`,
      `The person is on the screen “${screen.title || 'Home'}”. Its source:`,
      current,
      screen.shown ? `What it showed:\n${screen.shown}` : '',
      values ? `Fields as they were filled in:\n${values}` : '',
      `They just did this: ${request.intent}`,
      '',
      'Render the screen that should come next, as this app would show it. Carry over every fact, name, and number the person has seen or typed, and reflect what they just did (a new item appears, a toggle stays on, a detail opens). Keep the same visual style as the screen above.',
      'The window already shows a bar with back, forward, and this screen’s title above your screen. Do not draw a back button, a close button, or a toolbar that repeats the title; start with the content.',
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
  if (request.mode === 'fix') {
    return [
      `App: ${request.appName || 'this app'}. This first screen threw at runtime:`,
      current,
      `Error:\n${request.errorText || request.intent}`,
      'Return the repaired screen, same content and look.',
      '',
      FORMAT_FIRST,
    ].join('\n')
  }
  return [
    `The person opened an app: ${request.intent}`,
    request.mode === 'regenerate' ? 'Design it afresh.' : '',
    'Render the first screen they see when it opens. Make it impressive and complete on its own.',
    '',
    FORMAT_FIRST,
  ]
    .filter(Boolean)
    .join('\n')
}
