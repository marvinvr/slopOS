import fs from 'node:fs/promises'
import path from 'node:path'
import { appsDir } from '../paths'

/**
 * What makes an app's screens one growing app instead of loose pages:
 * - styles: every `<style>` block its screens defined (palette, classes, keyframes), loaded on all of them;
 * - navs: the newest markup of each `[data-nav="name"]` region (sidebar, tabs, header), placed on every screen;
 * - sections: screens with a stable name (`data-screen` links point at them), reachable from anywhere.
 */
export type Section = { viewId: string; title: string; intent?: string; from?: string; summary: string }

export type AppShell = {
  styles: string[]
  navs: Record<string, string>
  /** The section the first screen is. */
  root?: string
  sections: Record<string, Section>
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/
const MAX_STYLES = 40_000

export function sectionSlug(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return SLUG.test(slug) ? slug : undefined
}

function fileOf(appId: string): string {
  return path.join(appsDir, appId, 'shell.json')
}

export async function readShell(appId: string): Promise<AppShell> {
  try {
    const raw = JSON.parse(await fs.readFile(fileOf(appId), 'utf8')) as Partial<AppShell>
    return { styles: raw.styles || [], navs: raw.navs || {}, root: raw.root, sections: raw.sections || {} }
  } catch {
    // An app from before shells existed: its first screen is the whole shell.
    try {
      return fromRoot(await fs.readFile(path.join(appsDir, appId, 'index.html'), 'utf8'))
    } catch {
      return { styles: [], navs: {}, sections: {} }
    }
  }
}

const locks = new Map<string, Promise<unknown>>()

/** Jobs for one app run in parallel; their shell updates go one after another. */
async function update(appId: string, change: (shell: AppShell) => AppShell | Promise<AppShell>): Promise<AppShell> {
  const run = (locks.get(appId) || Promise.resolve()).catch(() => {}).then(async () => {
    const next = await change(await readShell(appId))
    await fs.writeFile(fileOf(appId), JSON.stringify(next, null, 2))
    return next
  })
  locks.set(appId, run)
  try {
    return await run
  } finally {
    if (locks.get(appId) === run) locks.delete(appId)
  }
}

function fromRoot(html: string, slug?: string): AppShell {
  const root = sectionSlug(slug)
  return {
    styles: limitStyles(styleBlocks(html)),
    navs: navBlocks(html),
    root,
    sections: root ? { [root]: { viewId: 'root', title: 'Home', summary: summaryOf(html) } } : {},
  }
}

/** A new first screen (create, edit, regenerate, revert) starts the shell over. */
export async function resetShell(appId: string, html: string, meta?: { screen?: unknown; title?: unknown } | null): Promise<void> {
  await update(appId, () => {
    const shell = fromRoot(html, meta?.screen as string | undefined)
    if (shell.root && typeof meta?.title === 'string') shell.sections[shell.root].title = meta.title.slice(0, 60)
    return shell
  })
}

/** A next screen joins the shell: its new styles, its nav regions, and its section if it has one. */
export async function addScreen(appId: string, screen: { viewId: string; slug?: string; title: string; intent: string; from: string; html: string }): Promise<void> {
  await update(appId, (shell) => {
    const styles = limitStyles([...shell.styles, ...styleBlocks(screen.html).filter((block) => !shell.styles.includes(block))])
    const navs = { ...shell.navs, ...navBlocks(screen.html) }
    const sections = { ...shell.sections }
    if (screen.slug) sections[screen.slug] = { viewId: screen.viewId, title: screen.title, intent: screen.intent, from: screen.from, summary: summaryOf(screen.html) }
    return { ...shell, styles, navs, sections }
  })
}

export function sectionOf(shell: AppShell, viewId: string): string | undefined {
  if (viewId === 'root') return shell.root
  return Object.entries(shell.sections).find(([, section]) => section.viewId === viewId)?.[0]
}

export function styleBlocks(html: string): string[] {
  return html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []
}

/** When the total grows too large, the oldest go first, except the first screen's: it holds the app's palette. */
function limitStyles(blocks: string[]): string[] {
  const out = [...blocks]
  while (out.length > 2 && out.reduce((sum, block) => sum + block.length, 0) > MAX_STYLES) out.splice(1, 1)
  return out
}

/** Every `[data-nav="name"]` element's outer HTML, found by balancing its tag. */
export function navBlocks(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const open of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*\bdata-nav\s*=\s*["']([^"']{1,40})["'][^>]*>/gi)) {
    const tag = open[1].toLowerCase()
    const start = open.index ?? 0
    const pattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
    pattern.lastIndex = start + open[0].length
    let depth = 1
    let match: RegExpExecArray | null
    while (depth > 0 && (match = pattern.exec(html))) depth += match[1] ? -1 : 1
    if (depth === 0 && !out[open[2]]) out[open[2]] = html.slice(start, pattern.lastIndex)
  }
  return out
}

/** What a screen shows, as a line of text for the next prompt. */
function summaryOf(html: string): string {
  const text = html
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length <= 360 ? text : `${text.slice(0, 359).trim()}…`
}
