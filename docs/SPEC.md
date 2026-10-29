# slopOS — shared engineering spec

Read `BRIEF.md` first (the product brief). This file is the contract every contributor follows.
If you need to deviate, keep the deviation small and document it in this file in the same commit.

## Taste — "macOS, reinterpreted"

A modern, slightly creative interpretation of macOS (see BRIEF.md › Style). Familiar structure — menu bar, dock,
traffic lights, spotlight, translucent chrome — but with its own character: tasteful, warm, a bit playful. Never
hyper-modern, flashy, neon, glassy-for-its-own-sake or cartoonish. Concretely:

- **Warm neutrals.** Light mode sits on warm paper/stone greys (e.g. #f6f4f0 / #ece8e1 surfaces, #1f1d1a text),
  dark mode on warm charcoal (e.g. #1c1b19 / #252321), never blue-black or pure #000/#fff.
- **One signature accent** used sparingly: a friendly warm tangerine/coral (around #ff6a3d-ish, tuned for contrast),
  user-switchable (tangerine, blue, green, plum, graphite, rose). Selection highlights are soft accent tints
  (`--slop-accent-soft`) with accent text, not saturated full bars.
- **Soft, slightly rounder geometry.** Windows 14px radius, controls 8px, popovers 12px, dock as a floating pill.
  1px hairlines in warm alpha, layered soft shadows (ambient + key), chrome with blur + a hint of warmth.
- **Type with a little character.** UI in Inter (variable, self-hosted, 13px base, slightly tight tracking on large
  sizes). Headings/display moments (About dialog, empty states, big numbers in apps) may use a characterful
  serif-ish display face such as "Fraunces" or "Instrument Serif" (self-hosted, used sparingly). Mono: JetBrains Mono.
- **Playful details, small doses:** a blob/drip-shaped "slop" logo mark; traffic lights with crisp tiny glyphs on hover;
  a gentle spring (very small overshoot) on window open and dock launch; menus that scale in from their anchor;
  empty states with a small illustrative touch (soft SVG shapes, not clipart); friendly microcopy.
- **Wallpaper:** soft, warm generated mesh/blob gradients with very subtle grain; a few variants incl. a dark one.
- **Motion:** 120–220ms, ease-out (`--slop-ease`), springs only for open/launch; respect prefers-reduced-motion.
- Light and dark mode (follow `prefers-color-scheme` by default; overridable from the logo menu).

Everything — shell, design kit, and the apps Grok generates (via the generation prompt + docs/APP_SDK.md) —
speaks this same language, so a generated app looks like it shipped with slopOS.

## Repo layout

```
package.json            single package (npm workspaces NOT used); scripts below
tsconfig.json
vite.config.ts          builds the shell (web/) and the app runtime (runtime/) into dist/
server/                 Node + TypeScript HTTP server (Fastify or plain node:http + small router)
  index.ts              serves dist/web, /runtime/*, /api/*; listens 0.0.0.0:${PORT:-4747}
  apps/                 app registry, compile (esbuild), persistence
  grok/                 grok CLI runner, job queue, prompts
web/                    the desktop shell (React 18 + TS + Vite)
  src/shell/            desktop, menu bar, dock, spotlight, drawer, window manager
  src/design/           tokens.css + shared component kit (also used by the SDK)
runtime/                code that runs INSIDE an app iframe: bootstrap + @slop/sdk implementation
fixtures/apps/<id>/     hidden test fixture apps for the pipeline/runtime (NOT shown to users)
data/                   runtime data, gitignored (generated apps, per-app storage, settings)
docs/SPEC.md            this file
docs/APP_SDK.md         the app SDK reference (also embedded into the Grok generation prompt)
```

Scripts:
- `npm run build` — build shell + runtime (vite) and the server (esbuild or tsc → `dist/server`).
- `npm run start` — `npm run build` then `node dist/server/index.js` (port 4747, host 0.0.0.0).
  Must work from a clean checkout after `npm install`.
- `npm run dev` — vite dev server on 5173 proxying `/api` + `/runtime` to a server on 4748 (tsx watch).
- `npm run typecheck` — `tsc --noEmit` for all parts.

Dependencies: keep them few and boring. React 18, Vite, esbuild (server-side compile), lucide-react
(icons), nanoid. No UI frameworks (no MUI/Chakra/Tailwind). Plain CSS (CSS modules or one stylesheet per
area) driven by the design tokens.

## Design tokens (`web/src/design/tokens.css`)

All colors/sizes are CSS custom properties on `:root`, with a `[data-theme="dark"]` override. Names:

```
--slop-font, --slop-font-display, --slop-font-mono
--slop-text-xs(11px) --slop-text-sm(12px) --slop-text-md(13px) --slop-text-lg(15px) --slop-text-xl(20px) --slop-text-2xl(28px)
--slop-radius-sm(6px) --slop-radius-md(8px) --slop-radius-lg(12px) --slop-radius-xl(14px)  (window = xl)
--slop-space-1(4px) … --slop-space-6(24px) --slop-space-8(32px)
--slop-bg            window/app background
--slop-bg-elevated   cards, popovers
--slop-bg-sunken     inputs, wells, sidebars
--slop-fg            primary text
--slop-fg-muted      secondary text
--slop-fg-subtle     tertiary/placeholder
--slop-border        hairline borders
--slop-accent        accent (default warm tangerine, see Taste) + --slop-accent-fg, --slop-accent-soft
--slop-danger --slop-success --slop-warning (+ -soft variants)
--slop-shadow-sm --slop-shadow-md --slop-shadow-lg (window shadow)
--slop-chrome-bg     translucent bg for menu bar/dock/spotlight (used with backdrop-filter)
--slop-ease (cubic-bezier(.2,.8,.2,1)), --slop-dur-fast(120ms), --slop-dur(180ms)
```

The same `tokens.css` is injected into every app iframe, and the current theme (light/dark + accent) is
pushed into iframes live when it changes.

## App format (every app is generated by Grok)

slopOS ships NO built-in apps. The OS is only the shell; every app is generated on demand. "About slopOS"
is a shell dialog, not an app. On first start the drawer/dock are empty and that must feel intentional: a calm,
beautiful empty state inviting the user to generate their first app (with a few example prompt chips).

An app is a directory:

```
manifest.json   { "id": "notes", "name": "Notes", "icon": "StickyNote", "description": "…",
                  "window": { "width": 720, "height": 480, "minWidth": 360, "minHeight": 240, "resizable": true },
                  "version": 1, "createdAt": "…", "updatedAt": "…", "prompt": "…", "prompts": [ … history … ] }
app.tsx         single file React component, `export default function App() { … }`
```

- `icon` is a lucide icon name (PascalCase, e.g. `StickyNote`, `Calculator`). The shell renders it on a
  rounded-square tile with a per-app tint (derive a stable hue from the id unless `manifest.tint` is set).
- `app.tsx` may ONLY import from `react` and `@slop/sdk`. No other imports, no CSS files. Styling via the
  SDK components, the tokens (`var(--slop-…)`) in inline styles, or a `<style>` string rendered by the app
  (prefix class names with the app id). Everything else (state, logic) lives in that one file.
- Apps live in `data/apps/<id>/` (+ `versions/<n>.tsx`). Test fixtures in `fixtures/apps/` are only loaded when
  `SLOP_FIXTURES=1` (for tests / screenshots), never by default.

## Runtime & sandbox

- Each open window hosts its app in an `<iframe sandbox="allow-scripts allow-forms allow-modals allow-popups">`
  (NO `allow-same-origin`) whose src is `/runtime/frame.html?app=<id>&v=<version>`.
- `frame.html` loads a shared runtime bundle (React, ReactDOM, the SDK + component kit) and then the
  compiled app module `/api/apps/<id>/bundle.js?v=<version>` (server-side esbuild: TSX → ESM, with
  `react` / `react/jsx-runtime` / `@slop/sdk` mapped to the runtime's globals, e.g. via an import map pointing at
  runtime-served ESM shims). Responses for runtime/bundles carry `Access-Control-Allow-Origin: *`
  (the sandboxed frame has a `null` origin).
- Host ⇄ app communication is ONLY via `postMessage` with a small typed protocol
  (`{ slop: 1, type, id?, payload }`), request/response matched by `id`. Message types (extend as needed):
  `ready`, `theme`, `setTitle`, `setSize`, `close`, `notify`, `storage.get|set|remove|keys`,
  `fetch` (server proxy), `menu.set`, `menu.invoke`, `error`, `focus`, `keydown` (forward global shortcuts like
  Cmd/Ctrl+Space and Cmd/Ctrl+W from inside the frame to the shell).
- App crashes (render errors via an error boundary, uncaught errors, unhandled rejections) are reported to
  the host as `error` with message + stack, and the frame shows a calm in-window error state. For generated
  apps the shell offers "Fix with Grok" (sends the error to the generation pipeline).

## `@slop/sdk` (public API — documented in docs/APP_SDK.md)

```ts
// window
useWindow(): { title: string; setTitle(t: string): void; setSize(w: number, h: number): void; close(): void; focused: boolean }
// storage, per app, persisted server-side (data/storage/<appId>.json), JSON values
useStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void, { loaded: boolean }]
storage: { get<T>(key): Promise<T | undefined>; set(key, value): Promise<void>; remove(key): Promise<void>; keys(): Promise<string[]> }
// system
notify(title: string, body?: string): void          // toast in the shell
useTheme(): { mode: 'light' | 'dark'; accent: string }
slopFetch(url: string, init?: RequestInit): Promise<Response>   // via server proxy /api/proxy (GET/POST, size/time limited)
useMenu(menus: { label: string; items: ({ label: string; shortcut?: string; disabled?: boolean; onSelect: () => void } | 'separator')[] }[]): void
                                                       // shows app menus in the shell menu bar while focused
useInterval(fn, ms), useHotkey(combo: string, fn)    // tiny helpers
// component kit (styled with tokens, look native)
Button (variant: 'primary'|'secondary'|'ghost'|'danger', size: 'sm'|'md'), IconButton, Input, TextArea, Select,
Checkbox, Switch, Slider, Card, List + ListItem (selectable, with icon/subtitle/trailing), Tabs, Toolbar,
Sidebar layout (SplitView), Stack (vertical, gap) + Row (horizontal, gap, align), Heading, Text (muted/size),
Badge, Divider, EmptyState, Spinner, Kbd, ScrollArea, Icon (name = lucide icon name, size)
```

The component kit source lives in `web/src/design/kit/` and is consumed by BOTH the shell and the runtime,
so shell UI and apps look identical.

## Server API (all JSON, under /api)

```
GET    /api/health                        { ok, grok: { available, loggedIn?, model, effort, reason? } }
GET    /api/apps                          list manifests
GET    /api/apps/:id                      manifest + source
GET    /api/apps/:id/bundle.js            compiled ESM (cached by version)
DELETE /api/apps/:id                      delete app (+ its storage, versions, workspace)
POST   /api/apps/generate   {prompt}      → { jobId }  create new app
POST   /api/apps/:id/edit   {prompt}      → { jobId }  edit-with-prompt (new version)
POST   /api/apps/:id/regenerate           → { jobId }  regenerate from original prompt
POST   /api/apps/:id/fix    {error}       → { jobId }  fix a runtime error
POST   /api/apps/:id/revert {version}
GET    /api/jobs/:id/events               SSE: { type: 'status'|'thinking'|'text'|'log'|'done'|'error', … }
GET    /api/jobs                          queue state
GET/PUT /api/storage/:appId[/:key]        per-app storage
POST   /api/proxy                         {url, method, headers, body} → proxied response (timeout, size cap)
GET/PUT /api/settings                     shell settings (theme, accent, wallpaper, dock pins, window layout)
```

## Generation via the grok CLI (NO API keys)

- Spawn `grok` (resolve from PATH, override with `SLOP_GROK_BIN`) in headless mode:
  `grok -p <prompt or --prompt-file> -m ${SLOP_GROK_MODEL:-grok-4.7} --reasoning-effort ${SLOP_GROK_EFFORT:-medium}
   --output-format streaming-json --cwd <workspace> --no-subagents --disable-web-search …` with tools limited to file
  read/write/edit inside the workspace (no shell, no web). The child env is `process.env` MINUS `XAI_API_KEY`,
  `GROK_API_KEY` and any `*_API_KEY` for xAI. Never set those anywhere.
- Workspace: `data/workspaces/<appId>/` containing `App.tsx` (current source, if editing), `APP_SDK.md`, and a
  `TASK.md`. Grok edits `App.tsx` (+ writes `manifest.json` fields name/icon/description/window). The server then
  validates (imports whitelist, default export, esbuild compile). On failure it re-runs grok (continuing the
  same session where possible, `-r <sessionId>`) with the error, up to 3 attempts.
- Parse `streaming-json` lines (`thought`, `text`, tool events, `end` with `sessionId`/usage) and forward them as SSE
  progress. One job at a time, FIFO queue, timeout (default 6 min), cancel support.
- Availability check at startup + on demand (`grok models` / a cheap probe). Auth failures produce a clear
  "Grok is not logged in — run `grok` once in a terminal" state; never try to work around auth.
- Mock mode for testing: `SLOP_GROK_MOCK=1` uses a fake runner that emits a realistic event stream and writes a
  canned app (and can simulate a compile error on attempt 1 to exercise the fix loop).

## Shell behaviour (summary)

Menu bar (top): logo menu (About slopOS dialog, theme light/dark/auto, Restart shell, …), active app name (bold),
app menus (from `useMenu` + standard Window menu), right side: generation status indicator, status icons,
clock (click → small calendar popover). Dock (bottom, auto-centered, magnify very slightly or not at all,
running indicators, pinned apps + drawer button). Windows: drag by title bar, resize all edges/corners,
traffic lights (close/minimize/maximize) with hover glyphs, double-click title to maximize, focus/z-order,
open/close/minimize animations, snapping not required. Spotlight (Cmd/Ctrl+Space, also Cmd/Ctrl+K): fuzzy
app search, arrow keys + Enter, last row "Generate '<query>' with Grok". Drawer: grid of all apps with search,
"New app" tile + empty state, right-click/⋯ on apps → Edit with prompt, Regenerate, Version history, Delete. Shortcuts:
Cmd/Ctrl+Space spotlight, Cmd/Ctrl+W close window, Cmd/Ctrl+M minimize, Esc closes popovers,
Cmd/Ctrl+` cycle windows. Since browsers eat some Cmd shortcuts, Ctrl variants must always work too.
Window state (open apps, positions) persists across reloads.

## Foundation notes

Small deviations from the paragraphs above, recorded so later passes don't trip on them:

- `compileApp(source)` in `server/apps/compile.ts` is **async** (`Promise<{ ok: true, code } | { ok: false, errors }>`). esbuild's API is async. Pass C should await it. The cache key is `id + version + source hash`, so a version bump is not required for a source edit to recompile.
- A failed compile is still served at `GET /api/apps/:id/bundle.js` as an ESM module that `throw`s the error text. The sandboxed frame has to load a script URL (import maps do not apply to blob URLs). Structured errors come from `compileApp` itself.
- `GET /api/apps` returns a JSON array of manifests. `GET /api/apps/:id` returns `{ manifest, source }`.
- Storage bodies are `{ value }` for `PUT` and `GET /api/storage/:appId/:key`. `GET /api/storage/:appId` returns `{ data }`. `DELETE /api/storage/:appId/:key` exists so `storage.remove` works. A missing key is `404`.
- `POST /api/proxy` allows `GET` and `POST` only, `http:`/`https:` only, no credentials in the URL, 15s timeout, 1MB response. The JSON result is `{ status, headers, body }`.
- Generation routes (`/api/apps/generate`, edit, regenerate, fix, revert, `/api/jobs`, `/api/jobs/:id/events`) answer `501 { error: 'not implemented yet' }` from `server/grok/index.ts`. Health reports `{ available: false, reason: 'not implemented yet', model, effort }`. Pass C replaces that module.
- Fixture apps under `fixtures/apps/` load only when `SLOP_FIXTURES=1`, are marked `fixture: true`, and `DELETE` on them returns 403. A generated app with the same id wins.
- The shell persists `windows[].restore` (the rect to return to after zoom) along with the fields in the settings paragraph.
