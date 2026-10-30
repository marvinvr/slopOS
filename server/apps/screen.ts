import { icons } from 'lucide'

/**
 * A generated screen as a document for the sandboxed window frame.
 * The runtime goes first in <head>: the theme is set before anything paints, Tailwind is
 * ready for the screen's classes, and the interaction hook listens before any of the
 * screen's own scripts run. React (+ htm) is a module the screen imports only if it wants it.
 */
const HEAD = [
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<link rel="stylesheet" href="/runtime/screen.css">',
  '<script src="/runtime/hook.js"></script>',
  '<script src="/runtime/tailwind.js"></script>',
  // Tailwind follows the OS theme on <html data-theme>, and knows the OS fonts and accent.
  '<style type="text/tailwindcss">',
  '@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));',
  '@theme inline { --color-accent: var(--slop-accent); --font-sans: "Inter Variable", system-ui, sans-serif; --font-display: "Fraunces Variable", Georgia, serif; --font-mono: "JetBrains Mono Variable", ui-monospace, monospace; }',
  '</style>',
].join('')

export function screenDocument(html: string): string {
  const head = HEAD + iconScript(html)
  const open = html.match(/<head\b[^>]*>/i)
  if (open && open.index !== undefined) {
    const at = open.index + open[0].length
    return html.slice(0, at) + head + html.slice(at)
  }
  const root = html.match(/<html\b[^>]*>/i)
  if (root && root.index !== undefined) {
    const at = root.index + root[0].length
    return `${html.slice(0, at)}<head>${head}</head>${html.slice(at)}`
  }
  const body = /<body\b/i.test(html) ? html : `<body>${html}</body>`
  return `<!doctype html><html lang="en"><head>${head}</head>${body}</html>`
}

type IconNode = [string, Record<string, string | number>][]
const table = icons as unknown as Record<string, IconNode>

/** Only the Lucide icons this screen names (`data-lucide="…"`, also inside its scripts), as SVG for the hook to place. */
function iconScript(html: string): string {
  const svgs: Record<string, string> = {}
  for (const match of html.matchAll(/data-lucide\s*=\s*["'`]([a-z0-9-]{1,48})["'`]/gi)) {
    const name = match[1].toLowerCase()
    if (svgs[name]) continue
    const node = table[name.replace(/(^|-)([a-z0-9])/g, (_, __, ch: string) => ch.toUpperCase())]
    if (!node) continue
    const children = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${String(value)}"`).join(' ')}/>`).join('')
    svgs[name] = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`
  }
  if (!Object.keys(svgs).length) return ''
  return `<script>window.__slopIcons=${JSON.stringify(svgs).replace(/</g, '\\u003c')}</script>`
}

/**
 * The screen's own inline scripts and styles run, nothing reaches the network,
 * and only the shell may frame it. The frame is sandboxed without allow-same-origin,
 * so the screen cannot touch the shell either; it only posts messages.
 */
export const SCREEN_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  'media-src data: blob:',
  "font-src 'self' data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ')
