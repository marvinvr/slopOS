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
  if (!data || data.slop !== SLOP_PROTOCOL || data.type !== 'theme') return
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
].join(',')

const CHANGES = ['checkbox', 'radio', 'range', 'color', 'date', 'time', 'datetime-local', 'month', 'week']

/** Elements under data-local belong to the screen's own script. */
function local(el: Element): boolean {
  return Boolean(el.closest('[data-local]'))
}

function interact(event: Event, interaction: Interaction): void {
  event.preventDefault()
  event.stopImmediatePropagation()
  send('interact', { interaction, values: fieldValues(), shown: clip(document.body?.innerText || '', 2500) })
}

window.addEventListener(
  'click',
  (event) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target || local(target)) return
    const hit = target.closest(TARGETS)
    if (!hit) return
    // Fields and their labels report through change and Enter instead.
    const field = target.closest('input, textarea, select, label')
    if (field && !field.matches('input[type="submit"], input[type="button"], input[type="image"]')) return
    if (hit.closest('[aria-disabled="true"], :disabled')) return
    interact(event, { action: 'click', label: labelOf(hit) })
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
    interact(event, { action: 'enter', label: fieldLabel(target), value: target.value.slice(0, 400) })
  },
  true,
)

window.addEventListener(
  'change',
  (event) => {
    const target = event.target
    if (!(target instanceof HTMLSelectElement || target instanceof HTMLInputElement) || local(target)) return
    if (target instanceof HTMLInputElement && !CHANGES.includes(target.type)) return
    const value = target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio') ? (target.checked ? 'on' : 'off') : target.value
    interact(event, { action: 'change', label: fieldLabel(target), value })
  },
  true,
)

window.addEventListener(
  'submit',
  (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null
    if (!form || local(form)) return
    const by = (event as SubmitEvent).submitter
    interact(event, { action: 'submit', label: (by && labelOf(by)) || form.getAttribute('aria-label') || 'the form' })
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

/** Two frames after the DOM is in (Tailwind has styled it), so the shell lifts its placeholder onto a painted screen. */
function ready(): void {
  placeIcons(document)
  new MutationObserver(() => placeIcons(document)).observe(document.documentElement, { childList: true, subtree: true })
  requestAnimationFrame(() => requestAnimationFrame(() => send('ready')))
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true })
else ready()
