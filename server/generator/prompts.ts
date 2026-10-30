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
  /** Current App.tsx, inlined so a file turn does not read the workspace. */
  currentSource?: string
  /** The session already contains the SDK. Skip resending it. */
  omitSdk?: boolean
}

const ONCE = [
  'Write each file named in the task once, with the write tool, immediately, in the order given. Then stop.',
  'Do not read files, list the directory, search, or use search_replace. Do not re-open a file you wrote. Do not take a second pass.',
].join('\n')

export const JSON_SESSION_RULES = 'Do not use tools. Do not write files. Reply with one JSON value and no markdown.'

/** Replaces Grok's system prompt on session/new. Tool schemas stay on the ACP channel. */
export const FILE_SYSTEM_PROMPT = [
  'You write slopOS apps and views. The user message is the whole task: what to build, the SDK signatures, the style rules, and the world.',
  'Your first action is the write tool. Write each required file once, in the order given, then stop.',
  'Do not read files, list directories, search, edit, verify, or browse. Do not explain the code.',
].join('\n')

export async function buildPrompt(request: PromptRequest): Promise<{ prompt: string; task: string; sdk: string }> {
  const task = taskBody(request)
  const digest = await worldDigest({ appId: request.appId, intent: request.intent })
  if (request.omitSdk) {
    const prompt = [
      'You are slopOS’s generator.',
      '',
      ONCE,
      'The SDK signatures and style rules from earlier in this session still apply. Do not open docs or source files.',
      '',
      '## World',
      'Use these names and facts. Do not invent a different name for something already here.',
      digest,
      '',
      '## Task',
      task,
    ].join('\n')
    return { prompt, task, sdk: '' }
  }
  if (request.mode === 'content' || request.mode === 'route') {
    const prompt = [
      `You are slopOS’s generator. ${JSON_SESSION_RULES}`,
      '',
      '## World',
      'Use these names and facts. Do not invent a different name for something already here.',
      digest,
      '',
      '## Task',
      task,
    ].join('\n')
    return { prompt, task, sdk: '' }
  }
  const sdk = sdkDigest(await readSdk())
  const prompt = [
    'You are slopOS’s generator. slopOS is a calm desktop in the browser. You write what the user asked for, and nothing else.',
    '',
    ONCE,
    '',
    '## Rules',
    '- Apps and views are a single file. Imports may only come from `react` and `@slop/sdk`. No other packages, no relative files, no CSS files, no `import()`.',
    '- Use the kit components first. When you style anything yourself, use `var(--slop-…)` tokens only. The app should look native, warm, and calm. Small playful touches are welcome. Nothing flashy, neon, or glassy for its own sake.',
    '- Persist user data with `useStorage`. Do not use `localStorage`.',
    '- An app that keeps the person’s own records (recipes, notes, habits, contacts, lists) must not open on an empty list. Declare three or four realistic items in the file, pass them as the `useStorage` initial value, and persist that same list once, only when `storage.get` for the key returns `undefined`. An empty list is not missing: it means the person deleted the items, so do not write them back. Every seed item is removed with the same control as an item they added. Prefer names from the world digest; otherwise invent ordinary ones, and list those names as entities in `world.json`. Clocks, calculators, dice, and converters start with no sample records. A view does not seed storage.',
    '- When another app in the world digest already stores the records this screen should show, read them with `useAppData(appId, key)`. The id is in parentheses after the app name, and the key is the Stores name. That read is read-only. Use each record’s `title` or `name`. Do not copy those records into this app’s own storage. This app’s `useStorage` is only for what it adds itself.',
    '- When the point of the app is generated writing (headlines, articles, a digest of this world), load that text with `useGenerated` and a JSON schema. Do not write the articles in the source. Pass a stable `key` so the same piece is cached.',
    '- Reach the network only through `slopFetch`. Do not call `fetch`.',
    '- Keyboard friendly. Sensible empty states (`EmptyState`). Fill the window (`height: 100%` on the root).',
    '- Implement what this app is actually about. For secondary screens, settings, detail pages, and links into other domains, leave the kit `Button`, `ListItem`, or `Card` without an `onClick` (or set `intent`) so slopOS can generate that screen later. Never fake a stub or a "coming soon".',
    '- Stay inside this working directory. Do not run shell commands, browse the web, or spawn subagents.',
    '',
    '## World',
    'Use these names and facts. Do not invent a different name for something already here.',
    digest,
    '',
    '## SDK reference',
    'This is the whole reference, distilled from docs/APP_SDK.md at job time. Every hook, type, and component prop is here. Do not open that file.',
    sdk,
    '',
    '## Task',
    task,
  ].join('\n')
  return { prompt, task, sdk }
}

/**
 * Generation-oriented digest of docs/APP_SDK.md.
 * Keeps every signature (hooks, types, props, tokens, manifest). Drops the example apps and the component usage samples.
 */
export function sdkDigest(doc: string): string {
  const parts = [
    section(doc, 'Hard rules'),
    condenseWorld(section(doc, 'The infinite world')),
    section(doc, 'Look native'),
    section(doc, 'manifest.json'),
    section(doc, 'Tokens'),
    section(doc, 'Window, storage, system'),
    section(doc, 'Generative API'),
    stripFences(section(doc, 'Components')),
    section(doc, 'Do not'),
  ]
  return parts.filter(Boolean).join('\n\n')
}

function section(doc: string, title: string): string {
  const header = `## ${title}\n`
  const start = doc.indexOf(header)
  if (start < 0) return ''
  const rest = doc.slice(start + header.length)
  const next = rest.search(/^## /m)
  const body = (next < 0 ? rest : rest.slice(0, next)).trim()
  return `## ${title}\n${body}`
}

function stripFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function condenseWorld(text: string): string {
  return text.replace(/\nWhile a destination is materializing[\s\S]*?yourself\.\n/, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Names and storage keys from an app, so a view does not open App.tsx. */
export function appFacts(source: string | undefined): string {
  if (!source) return 'No app source was inlined.'
  const keys = new Set<string>()
  for (const match of source.matchAll(/useStorage(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/g)) keys.add(match[1])
  for (const match of source.matchAll(/storage\.(?:get|set|remove)(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/g)) keys.add(match[1])
  const headings = [...source.matchAll(/<Heading[^>]*>([^<]{1,60})/g)].map((match) => match[1].trim()).filter(Boolean).slice(0, 6)
  const lines: string[] = []
  if (keys.size) lines.push(`Storage keys: ${[...keys].join(', ')}`)
  if (headings.length) lines.push(`Headings: ${headings.join(', ')}`)
  return lines.join('\n') || 'This app has no useStorage keys.'
}

function taskBody(request: PromptRequest): string {
  const attempt = request.attempt && request.attempt > 1 ? `This is compile attempt ${request.attempt} of 3. The previous file failed to compile. Write the corrected file once. Do not start over with a different app.` : ''
  if (request.mode === 'content') {
    return [
      'Kind: content. Do not use tools. Do not write files. Reply with one JSON value and no markdown.',
      request.schema ? `JSON schema:\n${JSON.stringify(request.schema)}` : 'Reply with a JSON object.',
      attempt,
      `Intent: ${request.intent}`,
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (request.mode === 'route') {
    return [
      'Kind: route. Do not use tools. Do not write files. Reply with one JSON object and no markdown.',
      'Choose how to satisfy the intent:',
      '- {"route":"existing","appId":"<id>"} when an app in the world already does this.',
      '- {"route":"view","appId":"<id>"} when it is another screen of the calling app (or of appId you were given).',
      '- {"route":"app","appId":""} when it is a different job and needs its own app.',
      `Schema: ${JSON.stringify(request.schema)}`,
      `Calling app: ${request.appId || 'none'}`,
      `Intent: ${request.intent}`,
    ].join('\n')
  }
  if (request.mode === 'view') {
    return [
      'Kind: view. Write `View.tsx` once, then `world.json` once, then stop. Do not modify `App.tsx`.',
      'The file must be exactly `export default function View({ params, context }) { ... }`.',
      'The shell already shows this screen’s title and a back chevron. Do not render a title bar, a Toolbar title, or a heading that repeats the screen name. Start with the screen’s content.',
      'Do not call setTitle or setSize. The window title stays the app name.',
      'Same import rules as an app. Views share the app’s useStorage keys. Do not seed storage and do not rewrite it.',
      'Also write `world.json`: {"summary":{"purpose":"one line about this screen"},"entities":[{"name":"","kind":"","description":""}]}',
      'Do not include dataShapes. Omit entities you did not invent.',
      `App facts (inlined; do not open App.tsx):\n${appFacts(request.currentSource)}`,
      attempt,
      request.errorText ? `Compiler errors:\n${request.errorText}` : '',
      `App: ${request.appName || request.appId || 'this app'}`,
      `Intent: ${request.intent}`,
    ]
      .filter(Boolean)
      .join('\n')
  }
  const files = [
    '1. `App.tsx` — `export default function App()`. One file, kit + tokens, the real behavior the user asked for.',
    '2. `manifest.json` — {"name":"","icon":"","description":"","window":{"width":720,"height":480,"minWidth":360,"minHeight":280,"resizable":true}}',
    '   name is at most 20 characters. icon is a Lucide icon name in PascalCase (Timer, StickyNote, Dices). description is one calm sentence. window size fits the UI.',
    '3. `world.json` — {"summary":{"purpose":"one line","dataShapes":["storage keys you used"]},"entities":[{"name":"","kind":"person|company|place|product|other","description":"one line"}]}',
    '   Only entities this app actually introduces. Reuse entities from the world digest instead of renaming them. When the app stores a list, the seed item names are entities.',
  ].join('\n')
  const inlined = request.currentSource ? `Current App.tsx (inlined; write the replacement once; do not read the file):\n\`\`\`tsx\n${request.currentSource}\n\`\`\`` : ''
  if (request.mode === 'edit') {
    return [`Kind: edit. Change the app to follow the instruction. Keep what still works. Write App.tsx once. Write manifest.json and world.json once only if the name, icon, or stored data changes.`, files, inlined, attempt, request.errorText ? `Compiler errors:\n${request.errorText}` : '', `Instruction: ${request.intent}`]
      .filter(Boolean)
      .join('\n\n')
  }
  if (request.mode === 'fix') {
    return [`Kind: fix. The app threw at runtime. Write the repaired App.tsx once. Keep the same purpose.`, inlined, attempt, `Error:\n${request.errorText || request.intent}`]
      .filter(Boolean)
      .join('\n\n')
  }
  if (request.mode === 'regenerate') {
    return [`Kind: regenerate. Write a fresh app from the original request. Ignore the previous design.`, files, inlined, attempt, request.errorText ? `Compiler errors:\n${request.errorText}` : '', `Request: ${request.intent}`]
      .filter(Boolean)
      .join('\n\n')
  }
  return [`Kind: create.`, files, inlined, attempt, request.errorText ? `Compiler errors:\n${request.errorText}` : '', `Request: ${request.intent}`].filter(Boolean).join('\n\n')
}

async function readSdk(): Promise<string> {
  return fs.readFile(path.join(root, 'docs', 'APP_SDK.md'), 'utf8')
}
