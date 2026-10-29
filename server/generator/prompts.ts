import fs from 'node:fs/promises'
import path from 'node:path'
import { root } from '../paths'
import type { GenKind } from './types'
import { worldDigest } from './world'

export type PromptRequest = {
  kind: GenKind
  mode: 'create' | 'edit' | 'regenerate' | 'fix' | 'view' | 'content' | 'route'
  intent: string
  appId?: string
  appName?: string
  errorText?: string
  attempt?: number
  schema?: Record<string, unknown>
}

export async function buildPrompt(request: PromptRequest): Promise<{ prompt: string; task: string; sdk: string }> {
  const [sdk, taste, digest] = await Promise.all([readSdk(), readTaste(), worldDigest({ appId: request.appId, intent: request.intent })])
  const task = taskBody(request)
  const prompt = [
    'You are slopOS’s generator. slopOS is a calm desktop in the browser. You write what the user asked for, and nothing else.',
    '',
    taste,
    '',
    '## Rules',
    '- Apps and views are a single file. Imports may only come from `react` and `@slop/sdk`. No other packages, no relative files, no CSS files, no `import()`.',
    '- Use the kit components first. When you style anything yourself, use `var(--slop-…)` tokens only. The app should look native, warm, and calm. Small playful touches are welcome. Nothing flashy, neon, or glassy for its own sake.',
    '- Persist user data with `useStorage`. Do not use `localStorage`.',
    '- Reach the network only through `slopFetch`. Do not call `fetch`.',
    '- Keyboard friendly. Sensible empty states (`EmptyState`). Fill the window (`height: 100%` on the root).',
    '- Implement what this app is actually about. For secondary screens, settings, detail pages, and links into other domains, leave the kit `Button`, `ListItem`, or `Card` without an `onClick` (or set `intent`) so slopOS can generate that screen later. Never fake a stub or a "coming soon".',
    '- Stay inside this working directory. Do not run shell commands, browse the web, or spawn subagents.',
    '',
    '## World',
    'Use these names and facts. Do not invent a different name for something already here.',
    digest,
    '',
    '## SDK reference (docs/APP_SDK.md)',
    sdk,
    '',
    '## Task',
    task,
  ].join('\n')
  return { prompt, task, sdk }
}

function taskBody(request: PromptRequest): string {
  const attempt = request.attempt && request.attempt > 1 ? `\nThis is compile attempt ${request.attempt} of 3. The previous file failed to compile. Fix it in place. Do not start over with a different app.\n` : ''
  if (request.mode === 'content') {
    return [
      'Kind: content. Do not use tools. Do not write files. Reply with one JSON value and no markdown.',
      request.schema ? `JSON schema:\n${JSON.stringify(request.schema)}` : 'Reply with a JSON object.',
      attempt,
      `Intent: ${request.intent}`,
    ].join('\n')
  }
  if (request.mode === 'route') {
    return [
      'Kind: route. Do not use tools. Do not write files. Reply with one JSON object and no markdown.',
      'Choose how to satisfy the intent:',
      '- {"route":"existing","appId":"<id>"} when an app in the world already does this.',
      '- {"route":"view","appId":"<id>"} when it is another screen of the calling app (or of appId you were given).',
      '- {"route":"app"} when it is a different job and needs its own app.',
      `Schema: ${JSON.stringify(request.schema)}`,
      `Calling app: ${request.appId || 'none'}`,
      `Intent: ${request.intent}`,
    ].join('\n')
  }
  if (request.mode === 'view') {
    return [
      'Kind: view. Write `View.tsx` in this directory. Do not modify `App.tsx`. It is there so the screen matches the app.',
      'The file must be exactly `export default function View({ params, context }) { ... }`.',
      'Same import rules as an app. Views share the app’s `useStorage` keys.',
      'Also write `world.json`: {"summary":{"purpose":"...","dataShapes":[]},"entities":[{"name":"","kind":"","description":""}]}',
      'Omit entities you did not invent. Keep the summary to one line about this screen.',
      attempt,
      request.errorText ? `Compiler errors:\n${request.errorText}` : '',
      `App: ${request.appName || request.appId || 'this app'}`,
      `Intent: ${request.intent}`,
    ]
      .filter(Boolean)
      .join('\n')
  }
  const files = [
    'Write these files in this directory. Use the file names as given. Do not explore the directory first; the SDK and the taste notes above are the whole reference.',
    '1. `App.tsx` — `export default function App()`. One file, kit + tokens, the real behavior the user asked for.',
    '2. `manifest.json` — {"name":"","icon":"","description":"","window":{"width":720,"height":480,"minWidth":360,"minHeight":280,"resizable":true}}',
    '   name is at most 20 characters. icon is a Lucide icon name in PascalCase (Timer, StickyNote, Dices). description is one calm sentence. window size fits the UI.',
    '3. `world.json` — {"summary":{"purpose":"one line","dataShapes":["storage keys you used"]},"entities":[{"name":"","kind":"person|company|place|product|other","description":"one line"}]}',
    '   Only entities this app actually introduces. Reuse entities from the world digest instead of renaming them.',
  ].join('\n')
  if (request.mode === 'edit') {
    return [`Kind: edit. Change the existing App.tsx to follow the instruction. Keep what still works.`, files, attempt, request.errorText ? `Compiler errors:\n${request.errorText}` : '', `Instruction: ${request.intent}`]
      .filter(Boolean)
      .join('\n\n')
  }
  if (request.mode === 'fix') {
    return [`Kind: fix. The app threw at runtime. Repair App.tsx. Keep the same purpose.`, files, attempt, `Error:\n${request.errorText || request.intent}`]
      .filter(Boolean)
      .join('\n\n')
  }
  if (request.mode === 'regenerate') {
    return [`Kind: regenerate. Write a fresh App.tsx from the original request. Ignore the previous design.`, files, attempt, request.errorText ? `Compiler errors:\n${request.errorText}` : '', `Request: ${request.intent}`]
      .filter(Boolean)
      .join('\n\n')
  }
  return [`Kind: create.`, files, attempt, request.errorText ? `Compiler errors:\n${request.errorText}` : '', `Request: ${request.intent}`].filter(Boolean).join('\n\n')
}

async function readSdk(): Promise<string> {
  return fs.readFile(path.join(root, 'docs', 'APP_SDK.md'), 'utf8')
}

async function readTaste(): Promise<string> {
  const spec = await fs.readFile(path.join(root, 'docs', 'SPEC.md'), 'utf8')
  const start = spec.indexOf('## Taste')
  if (start < 0) return ''
  const rest = spec.slice(start + 1)
  const next = rest.search(/\n## [^#]/)
  const body = next < 0 ? spec.slice(start) : spec.slice(start, start + 1 + next)
  return body.trim()
}
