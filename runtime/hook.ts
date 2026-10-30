/**
 * Runs first inside every generated screen (a sandboxed document of its own).
 * It paints the OS theme, places Lucide icons, forwards global shortcuts, and turns every
 * meaningful interaction into one message to the shell, which asks for the next screen.
 * The screen's own scripts keep running for local effects.
 */
import '@fontsource-variable/fraunces'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '../web/src/design/tokens.css'
import './screen.css'
import './uuid'
import { applyTheme } from '../web/src/design/theme'
import { SLOP_PROTOCOL, type Interaction, type SlopMessage } from './protocol'

const params = new URLSearchParams(location.search)
const winId = params.get('win') ?? ''

function send(type: string, payload?: unknown): void {
  parent.postMessage({ slop: SLOP_PROTOCOL, type, winId, payload }, '*')
}

const initial = params.get('theme')
applyTheme(initial === 'dark' || initial === 'light' ? initial : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', params.get('accent') || undefined)

window.addEventListener('message', (event) => {
  if (event.source !== parent) return
  const data = event.data as SlopMessage | null
  if (!data || data.slop !== SLOP_PROTOCOL) return
  if (data.type === 'idle') return release()
  if (data.type !== 'theme') return
  const payload = (data.payload ?? {}) as { mode?: string; accent?: string }
  applyTheme(payload.mode === 'dark' ? 'dark' : 'light', payload.accent)
})

/** Shortcuts the shell owns. Ctrl works even when the browser eats Cmd. */
function isForwardedShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase()
  if (!(event.metaKey || event.ctrlKey)) return false
  // Snap chords are Ctrl/Cmd+Alt+arrows. Checked before the alt bail-out.
  if (event.altKey && !event.shiftKey && (event.key.startsWith('Arrow') || event.code.startsWith('Arrow'))) return true
  if (event.altKey) return false
  if (key === 'f' && (event.shiftKey || (event.metaKey && event.ctrlKey))) return true
  if (event.shiftKey && (key === 'a' || event.code === 'KeyA')) return true
  if (event.shiftKey) return false
  return key === 'w' || key === 'm' || key === 'k' || key === '/' || event.code === 'Slash' || key === ' ' || event.code === 'Space' || event.key === '`' || event.code === 'Backquote'
}

function keyPayload(event: KeyboardEvent) {
  return { key: event.key, code: event.code, metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, repeat: event.repeat }
}

function historyKey(event: KeyboardEvent): 'back' | 'forward' | null {
  const mod = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
  if ((event.altKey && event.key === 'ArrowLeft') || (mod && (event.key === '[' || event.code === 'BracketLeft'))) return 'back'
  if ((event.altKey && event.key === 'ArrowRight') || (mod && (event.key === ']' || event.code === 'BracketRight'))) return 'forward'
  return null
}

window.addEventListener(
  'keydown',
  (event) => {
    const nav = historyKey(event)
    if (!nav && !isForwardedShortcut(event)) return
    event.preventDefault()
    event.stopPropagation()
    if (nav) send('nav', { to: nav })
    else send('keydown', keyPayload(event))
  },
  true,
)
window.addEventListener(
  'keyup',
  (event) => {
    if (event.key === 'Control' || event.key === 'Meta' || event.key === 'Alt') send('keyup', keyPayload(event))
  },
  true,
)
// Escape stays in the screen if something there handled it. Otherwise the shell gets it.
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  const payload = keyPayload(event)
  queueMicrotask(() => {
    if (!event.defaultPrevented) send('keydown', payload)
  })
})

const TARGETS = [
  'a',
  'button',
  'input[type="submit"]',
  'input[type="button"]',
  'input[type="image"]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[data-action]',
  '[data-screen]',
].join(',')

const CHANGES = ['checkbox', 'radio', 'range', 'color', 'date', 'time', 'datetime-local', 'month', 'week']

/** Elements under data-local belong to the screen's own script. */
function local(el: Element): boolean {
  return Boolean(el.closest('[data-local]'))
}

/** The element waiting for the next screen. Until it arrives (or the shell says idle) the screen takes no other input. */
let waiting: HTMLElement | null = null

function interact(event: Event, interaction: Interaction, el: Element | null): void {
  event.preventDefault()
  event.stopImmediatePropagation()
  if (waiting) return
  send('interact', { interaction, values: fieldValues(), shown: clip(document.body?.innerText || '', 2500) })
  hold(el)
}

/** Swallow input while a screen is on its way. */
function blocked(event: Event): boolean {
  if (!waiting) return false
  event.preventDefault()
  event.stopImmediatePropagation()
  return true
}

function hold(el: Element | null): void {
  const target = el instanceof HTMLElement ? el : document.body
  const box = target.getBoundingClientRect()
  const style = getComputedStyle(target)
  // Small controls swap their content for a spinner, links in text pulse, rows, cards and fields shimmer in place.
  const field = target.matches('input, textarea, select')
  const mode = field ? 'shimmer' : style.display === 'inline' ? 'pulse' : box.height <= 64 && box.width <= 160 ? 'spin' : 'shimmer'
  target.style.setProperty('--slop-wait-color', style.color)
  // Anchor for the spinner and shimmer; an element that is already positioned stays exactly where it is.
  if (style.position === 'static' && !field) target.setAttribute('data-slop-anchor', '')
  target.setAttribute('data-slop-wait', mode)
  target.setAttribute('aria-busy', 'true')
  document.documentElement.setAttribute('data-slop-busy', '')
  waiting = target
}

function release(): void {
  if (!waiting) return
  waiting.removeAttribute('data-slop-wait')
  waiting.removeAttribute('data-slop-anchor')
  waiting.removeAttribute('aria-busy')
  waiting.style.removeProperty('--slop-wait-color')
  document.documentElement.removeAttribute('data-slop-busy')
  waiting = null
}

/** The visible thing a field interaction belongs to: its label or the field itself. */
function holderOf(field: Element): Element {
  const label = field.closest('label')
  if (label) return label
  if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) return field.parentElement || field
  return field
}

window.addEventListener(
  'click',
  (event) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target || local(target)) return
    const hit = target.closest(TARGETS)
    // Fields and their labels report through change and Enter instead.
    const field = target.closest('input, textarea, select, label')
    if ((hit || field) && blocked(event)) return
    if (!hit) return
    if (field && !field.matches('input[type="submit"], input[type="button"], input[type="image"]')) return
    if (hit.closest('[aria-disabled="true"], :disabled')) return
    const section = hit.closest('[data-screen]')?.getAttribute('data-screen')
    interact(event, { action: 'click', label: labelOf(hit), ...(section ? { screen: section } : {}) }, hit)
  },
  true,
)

window.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Enter' || event.isComposing) return
    const target = event.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || local(target)) return
    if (target instanceof HTMLTextAreaElement && !(event.metaKey || event.ctrlKey)) return
    if (target instanceof HTMLInputElement && (CHANGES.includes(target.type) || ['submit', 'button', 'image'].includes(target.type))) return
    if (blocked(event)) return
    interact(event, { action: 'enter', label: fieldLabel(target), value: target.value.slice(0, 400) }, target)
  },
  true,
)

window.addEventListener(
  'change',
  (event) => {
    const target = event.target
    if (!(target instanceof HTMLSelectElement || target instanceof HTMLInputElement) || local(target)) return
    if (target instanceof HTMLInputElement && !CHANGES.includes(target.type)) return
    if (blocked(event)) return
    const value = target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio') ? (target.checked ? 'on' : 'off') : target.value
    interact(event, { action: 'change', label: fieldLabel(target), value }, holderOf(target))
  },
  true,
)

window.addEventListener(
  'submit',
  (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null
    if (!form || local(form)) return
    if (blocked(event)) return
    const by = (event as SubmitEvent).submitter
    interact(event, { action: 'submit', label: (by && labelOf(by)) || form.getAttribute('aria-label') || 'the form' }, by || form.querySelector('button:not([type="button"]), input[type="submit"]') || form)
  },
  true,
)

function labelOf(el: Element): string {
  const own = el.getAttribute('data-action') || el.getAttribute('aria-label') || el.getAttribute('title') || (el as HTMLElement).innerText || el.textContent || (el as HTMLInputElement).value || ''
  return clip(own, 80) || el.tagName.toLowerCase()
}

function fieldLabel(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const byFor = field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`)?.textContent : ''
  const wrapped = field.closest('label')?.textContent
  const raw = field.getAttribute('aria-label') || byFor || wrapped || ('placeholder' in field ? field.placeholder : '') || field.name || 'a field'
  return clip(raw, 60)
}

function fieldValues(): { field: string; value: string }[] {
  const out: { field: string; value: string }[] = []
  document.querySelectorAll('input, textarea, select').forEach((node) => {
    const field = node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    if (field instanceof HTMLInputElement && (field.type === 'password' || field.type === 'hidden')) return
    const value = field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio') ? (field.checked ? 'on' : '') : field.value
    if (value) out.push({ field: fieldLabel(field), value: value.slice(0, 200) })
  })
  return out.slice(0, 20)
}

function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trim()}…`
}

/** Lucide icons: `<i data-lucide="name">` gets the SVG the server inlined for this screen, also when a script adds it later. */
function placeIcons(root: ParentNode): void {
  const svgs = (window as { __slopIcons?: Record<string, string> }).__slopIcons
  if (!svgs) return
  root.querySelectorAll<HTMLElement>('[data-lucide]:not([data-lucide-done])').forEach((el) => {
    const svg = svgs[el.dataset.lucide || '']
    if (!svg) return
    el.setAttribute('data-lucide-done', '')
    el.innerHTML = svg
  })
}

type Shell = { navs: Record<string, string>; section: string | null }

/** The app's shell: each nav region of this screen becomes its newest version, with the current section marked. */
function placeShell(): void {
  const shell = (window as { __slopShell?: Shell }).__slopShell
  if (!shell) return
  const current = shell.section || document.querySelector('[data-nav] [aria-current="page"][data-screen]')?.getAttribute('data-screen')
  for (const [name, markup] of Object.entries(shell.navs)) {
    const own = document.querySelector(`[data-nav="${CSS.escape(name)}"]`)
    if (!own || own.outerHTML === markup) continue
    const template = document.createElement('template')
    template.innerHTML = markup
    const fresh = template.content.firstElementChild
    if (fresh) own.replaceWith(fresh)
  }
  if (!current) return
  document.querySelectorAll('[data-nav] [data-screen], [data-nav][data-screen]').forEach((el) => {
    if (el.getAttribute('data-screen') === current) el.setAttribute('aria-current', 'page')
    else el.removeAttribute('aria-current')
  })
}

/** Two frames after the DOM is in (Tailwind has styled it), so the shell lifts its placeholder onto a painted screen. */
function ready(): void {
  placeShell()
  placeIcons(document)
  new MutationObserver(() => placeIcons(document)).observe(document.documentElement, { childList: true, subtree: true })
  requestAnimationFrame(() => requestAnimationFrame(() => send('ready')))
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true })
else ready()
