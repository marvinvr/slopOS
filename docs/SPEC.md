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

## Open source

slopOS is public (github.com/marvinvr/slopOS, MIT). Never commit secrets, `.env`, `data/` (the world store), absolute
paths from a developer machine (`/Users/...`), usernames, or anything machine-specific. Resolve CLIs from PATH (with
`SLOPOS_<P>_BIN` overrides), paths relative to the repo / `process.cwd()`. Contributors commit locally; the orchestrator
reviews and pushes.

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
docs/APP_SDK.md         the app SDK reference (a job-time digest is embedded into the generation prompt)
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
  `SLOPOS_FIXTURES=1` (for tests / screenshots), never by default.

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
  `ready`, `theme`, `setTitle`, `setSize`, `close`, `notify`, `storage.get|set|remove|keys|read`,
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
useAppData<T>(appId: string, key: string): [T | undefined, { loaded: boolean }]  // read-only, another app’s store
storage: { get<T>(key): Promise<T | undefined>; set(key, value): Promise<void>; remove(key): Promise<void>; keys(): Promise<string[]> }
// system
notify(title: string, body?: string): void          // toast in the shell
useTheme(): { mode: 'light' | 'dark'; accent: string }
slopFetch(url: string, init?: RequestInit): Promise<Response>   // via server proxy /api/proxy (GET/POST, size/time limited)
useMenu(menus: { label: string; items: ({ label: string; shortcut?: string; disabled?: boolean; onSelect: () => void } | 'separator')[] }[]): void
                                                       // shows app menus in the shell menu bar while focused
useInterval(fn, ms), useHotkey(combo: string, fn), useNow(intervalMs?)
formatters.date / .time / .relative / .number
openApp(id), clipboard.write(text), download(filename, data), confirm(message): Promise<boolean>
// generative world — see "The infinite world"
generate, useGenerated, <GenerativeView>, openGenerative, useGenContext, useScreens
// component kit (styled with tokens, look native)
Button (variant: 'primary'|'secondary'|'ghost'|'danger', size: 'sm'|'md'), IconButton, Input, TextArea, Select,
Checkbox, Switch, Slider, SearchField, NumberInput (Stepper), SegmentedControl, ColorSwatch, ProgressBar,
Card, List + ListItem, Tabs, Link, Toolbar, SplitView (optional resizable), Stack, Row, Grid, Section, Field,
Heading, Text, Badge, Tag, Chip, Avatar, Table, Tooltip, Menu (DropdownMenu), Dialog, Sheet,
Divider, EmptyState, Spinner, Kbd, ScrollArea, Icon (name = lucide icon name, size)
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

## Generator providers (local CLIs + subscriptions, NO API keys)

The generator is pluggable (BRIEF.md › Generator providers). Marvin's configuration uses **grok**; **codex** and **claude**
must work too. Every provider runs a locally installed CLI that is logged in with a subscription. API keys are never
used: the child env is `process.env` minus `XAI_API_KEY`, `GROK_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
(and any other `*_API_KEY` of these vendors); slopOS never sets them anywhere.

```ts
// server/generator/types.ts — the one small interface
interface GeneratorProvider {
  id: 'grok' | 'codex' | 'claude' | 'mock'
  availability(): Promise<{ available: boolean; loggedIn?: boolean; reason?: string; model: string; effort: string }>
  run(opts: { prompt: string; cwd: string; kind: 'app'|'view'|'content'|'route'; jsonSchema?: object;
              resumeSessionId?: string; freshSession?: boolean; sessionKey?: string;
              signal: AbortSignal; timeoutMs: number; model: string; effort: string }): AsyncIterable<GenEvent>
}
type GenEvent = { type: 'status'|'thinking'|'text'|'tool'|'log'; text: string }
              | { type: 'end'; sessionId?: string; output?: string /* final text / JSON */; usage?: object }
              | { type: 'error'; message: string; auth?: boolean }
```

**One path per provider, no fallbacks:** grok = ACP only, claude = Claude Agent SDK only, codex = `codex exec --json` only.
No silent fallback between providers or modes; failures surface as clear errors in the UI.

Providers (selected by `SLOPOS_GENERATOR`, default `grok`; each with `SLOPOS_<P>_BIN`, `SLOPOS_<P>_MODEL`, `SLOPOS_<P>_EFFORT`):
- **grok** (default): a long-lived `grok agent stdio` process (Grok CLI ACP mode, SuperGrok login, no API key) driven with
  the official TypeScript client `@agentclientprotocol/sdk` (JSON-RPC: initialize, session/new with cwd = the per-app
  sandbox workspace, session/prompt with streaming session/update notifications, session/cancel, model
  `${SLOPOS_GROK_MODEL:-grok-4.7}` / effort `${SLOPOS_GROK_EFFORT:-medium}` per session, permission requests answered
  by slopOS: allow only file read/write/edit inside the workspace, deny shell/web/everything else). After `session/new`,
  `session/load`, and an in-memory resume, slopOS calls `session/set_config_option` for `model` and `reasoning_effort`.
  The CLI flag loses to the user's own config in ACP mode; the protocol call is what makes the slopOS setting stick.
  `session/new` passes `_meta.systemPromptOverride`: a short write-once prompt, so the CLI's own verify-with-tools instructions do not add a revision pass. Tool schemas stay on the ACP channel. Avoids the ~6 s
  per-call startup, supports cancel, and keeps one session per app for coherent follow-up generations (edit/fix/views).
  Child env adds `GROK_CLAUDE_MCPS_ENABLED=0` and `GROK_MEMORY=0` (so the user's own skills/MCP servers/memory don't
  leak in). Restart the process if it dies; if ACP cannot start/initialize, the provider reports
  unavailable with the error (shown clearly in the UI) — there is NO `grok -p` fallback.
- **codex**: `codex exec --json` (ChatGPT login). The prompt is stdin (`-`). Flags are `--skip-git-repo-check --ignore-rules -C <workspace> --sandbox workspace-write -c sandbox_workspace_write.network_access=false -c model_reasoning_effort=<effort> -c approval_policy="never"`. `-m` is omitted when the model is unset, so the CLI's own model is used. Those sandbox flags stay on `exec` even when resuming: the `resume` subcommand does not accept them, and a resumed turn without them is read-only. The form is `codex exec <flags> resume <sessionId> -`. Content and route add `--output-schema <file> -o <file>`. The schema copy lists every object property in `required` and sets `additionalProperties: false`. Edits and warm views resume the app session when the saved cwd matches.
- **claude**: `@anthropic-ai/claude-agent-sdk` `query()` on the local Claude Code login, no API key. `permissionMode: dontAsk`, `settingSources: []`, `mcpServers: {}`, `persistSession: true`. App and view tools are only Read, Write, and Edit (`maxTurns` 16). Content and route pass no tools (`maxTurns` 2) and `outputFormat: { type: 'json_schema', schema }` using that same strict schema. `disallowedTools` is Bash, PowerShell, WebSearch, WebFetch, Task, Agent, Skill, NotebookEdit, and TodoWrite. `canUseTool` denies anything else and any path outside the workspace. The system prompt is the `claude_code` preset plus the write-once rule, or the JSON-only rule for content and route. `model` is omitted when unset. Effort is low for content and route and medium otherwise, unless an env override is set. Edits and warm views pass `resume` for the app session when the saved cwd matches. Abort is an AbortController.
- **mock**: `SLOPOS_GENERATOR=mock` — canned, realistic event streams + results for all kinds (tests, screenshots).

Common pipeline (provider-independent): workspace `data/workspaces/<appId>/` holds the current `App.tsx` when editing.
The prompt inlines the task, the app style notes from APP_SDK.md, a job-time digest of that file (every hook, type, and
component signature; the example apps are left out), and the world digest, so the provider does not need to read the
workspace. It is asked to write `App.tsx` (or `View.tsx`), `manifest.json`, and `world.json` once each and then stop.
Content and route prompts omit the SDK catalog. A view reuses the app session when that session is still the one we would load, and then the prompt does not repeat the SDK. The server validates (imports whitelist, default export, esbuild compile)
and on failure resumes the session with the errors, up to 3 attempts. Create, edit, fix, and a warm view keep one session per app.
Job queue with concurrency `SLOPOS_CONCURRENCY`
(default 2). Timeouts are per kind: app 10 min
(`SLOPOS_TIMEOUT_MS_APP`), view 5 min (`SLOPOS_TIMEOUT_MS_VIEW`), content 90 s (`SLOPOS_TIMEOUT_MS_CONTENT`),
route 60 s (`SLOPOS_TIMEOUT_MS_ROUTE`). A set per-kind value wins; `SLOPOS_TIMEOUT_MS` covers any kind without one.
Cancel stays. Availability probe at startup + cached 60s; auth failures → clear "<Provider> isn't signed in — run `<cli>`
once in a terminal" state; never work around auth. UI copy names the active provider ("Generate with Grok" /
"with Codex" / "with Claude").

All slopOS env vars use the `SLOPOS_` prefix (e.g. `SLOPOS_FIXTURES=1`, `SLOPOS_GENERATOR`, `PORT`).

## The infinite world (core architecture — see BRIEF.md › Core idea)

slopOS is not "an app generator with a launcher". It is a world that materializes as you use it: every search bar
and every button — in the shell AND inside generated apps — can lead to Grok generating what's behind it. Three
generation **kinds**, one pipeline:

| kind      | what Grok produces                                   | rendered where                                   | typical latency |
|-----------|------------------------------------------------------|--------------------------------------------------|-----------------|
| `app`     | a new app (App.tsx + manifest.json)                  | new window, appears in drawer/spotlight          | slowest         |
| `view`    | a screen component (View.tsx) for an existing app    | pushed onto that window's screen stack, or inline | medium          |
| `content` | JSON data matching a schema the caller supplies      | returned to the calling app code                  | fastest         |

Plus `auto`: the caller only has an intent ("Open settings", "Show invoices for ACME", "Weather in Lisbon"). Spotlight and a handler-less kit button both `POST /api/gen` with `kind: "auto"`. Before a model runs, a local match opens an app when one score is at least 80 and leads the next by 15: exact name 100, exact storage key (or a single-word plural of that key) 92, every name word present in a short intent 80. Otherwise the route model answers `existing`, `view`, or `app`. A cached app result opens at once and does not start a job.

### SDK surface (runtime, owned by pass B)

```ts
generate<T>(req: GenRequest): Promise<GenResult<T>>          // low-level
type GenRequest = { intent: string; kind?: 'auto'|'app'|'view'|'content'; context?: unknown;
                    schema?: object /* JSON schema, content only */; key?: string /* cache key override */; fresh?: boolean }
type GenResult<T> = { kind: 'content'; data: T } | { kind: 'view'; viewId: string } | { kind: 'app'; appId: string }
useGenerated<T>(req: GenRequest | null): { status: 'idle'|'loading'|'ready'|'error'; data?: T; error?: string;
                                         progress?: string; regenerate(): void }   // content convenience
<GenerativeView intent context? fallback? />   // renders a generated view inline (with materializing state)
openGenerative({ intent, context? })           // auto: open existing app / push a generated screen / generate an app
useGenContext(ctx: object)                      // what's on screen right now; attached to every generative request
useScreens(): { push(viewId|{intent,context}), pop(), stack }   // in-window screen stack (persisted per window)
useAppData<T>(appId: string, key: string): [T | undefined, { loaded: boolean }]  // read-only, another app's store
```

**Generative by default ("every button"):** kit `Button`, `ListItem`, `Link`/`Card` (clickable) WITHOUT an `onClick`/
`onSelect` (and not disabled) are generative: clicking calls `openGenerative({ intent: props.intent ?? label, context })`
where context = app id/name + current screen title + `useGenContext` data. `SearchField` without `onSearch` likewise
generates a results screen for the query. Such elements carry a barely-there affordance (e.g. a tiny sparkle on hover)
so generativity is discoverable but not noisy. The generation prompt tells Grok: implement what the app is about for
real; for everything beyond that (secondary screens, settings, "more…", detail pages, links into other domains) leave
the button handler-less or give it an explicit `intent` — never fake a stub or a "coming soon".

Generated **views** use the app format with a different signature: `export default function View({ params, context })`
(same import rules; they may use `useStorage` — storage is per app, so views share data with their app). `useAppData(appId, key)` reads another app's store and cannot write it. They are
compiled like apps and loaded by the runtime via dynamic `import()` of their bundle URL into the same iframe.

**Materializing states** (tasteful, OS-like): a screen being generated shows the target title immediately with a soft
shimmering skeleton + a one-line live status ("Sketching layout…" from the grok stream), never a spinner-only blank.
Generative buttons show a subtle in-place progress. Generating apps show the GenerationActivity in the menu bar.

### Host ⇄ app protocol additions

`gen.request {requestId, req}` (app → host) · `gen.progress {requestId, status, text}` · `gen.result {requestId, result}` ·
`gen.error {requestId, error}` (host → app) · `gen.open {intent, context}` (app → host, auto-routing done by host+server) ·
`screens.state {stack}` (app → host, persisted with the window). The shell bridge forwards gen requests to the server
and relays job events.

### Server (owned by pass C)

```
POST /api/gen {appId?, windowId?, kind, intent, context, schema?, key?, fresh?}
     → { cached: true, result } | { jobId }      (job SSE ends with { type:'done', result })
GET  /api/apps/:id/views/:viewId/bundle.js        compiled generated view
GET  /api/world                                   world digest (debug / shell)
POST /api/reset {confirm: "RESET"}                wipe the whole generated world → pristine start
```

- **Cache & consistency:** every generation has a cache key = hash(appId | kind | normalized intent | stable hash of
  `context.scope` if given) unless `key` is passed. Same key → same stored result, returned instantly (no regeneration
  unless `fresh` or the user chooses Regenerate). In-flight identical requests are de-duplicated.
- **World store** (`data/world/`): app summaries (name, purpose, data shapes it stores), entities Grok invented
  (people, companies, places, products… with one-line descriptions and owning app), the generation log (intent → result),
  and stored views/content. Every prompt gets a compact **world digest** (capped, most relevant first: the calling app's
  summary + its views + related entities + other apps' names/purposes) so results are coherent with what exists.
  After each generation Grok also writes `world.json` (entities/summary deltas) in its workspace; the server merges it.
- **Models per kind** (overridable per provider and kind, e.g. `SLOPOS_GROK_MODEL_CONTENT`): grok app and view `grok-4.7`/medium, grok content and route `grok-4.7-build-fast`/low with no tools. Codex and Claude omit the model, so each CLI's own default is used; their effort is medium for app and view and low for content and route. Codex and Claude receive a strict JSON schema (`--output-schema`, or the Agent SDK `outputFormat`). Grok ACP has no schema flag, so the schema goes in the prompt and the server validates it. Timeouts: app 10 min, view 5 min, content 90 s, route 60 s. Queue concurrency `SLOPOS_CONCURRENCY` (default 2). Interactive view/content/route jobs start before app jobs that are still queued (FIFO inside each class, no preemption).
- **Persistence = continue where you left off:** apps, views, content, world, app storage, open windows with geometry
  and each window's screen stack all survive restarts and reloads.
- **Reset slopOS:** logo menu → confirm dialog ("This erases every app and everything in this world") → `POST /api/reset`
  → server wipes `data/` (apps, views, content, world, storage, workspaces, jobs, settings) → shell clears its
  localStorage and reloads into the pristine first-run (incl. the "Enter slopOS" moment).

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
- Storage bodies are `{ found: true, value }` for `GET /api/storage/:appId/:key` and `{ value }` for `PUT`. A missing key is `200 { found: false }` (not 404) so a first launch does not log a network error. The SDK treats `found: false` as "use the initial value". `GET /api/storage/:appId` returns `{ data }`. `DELETE /api/storage/:appId/:key` exists so `storage.remove` works.
- `POST /api/proxy` allows `GET` and `POST` only, `http:`/`https:` only, no credentials in the URL, 15s timeout, 1MB response. The JSON result is `{ status, headers, body }`.
- Generation is implemented in `server/generator/`. Health is `{ ok, grok: { available, loggedIn, model, effort, reason, provider } }`. The object is still called `grok`; `provider` is `grok`, `codex`, `claude`, or `mock`.
- Grok content and route turns do not use `--json-schema`. ACP has no schema flag, so the schema is in the prompt and the server checks the JSON (one retry). Codex uses `--output-schema`. Claude uses the Agent SDK `outputFormat`. For those two, the schema copy requires every object property and sets `additionalProperties` to false.
- `session/load` is used only when the Grok agent advertises `loadSession`. Otherwise the session id lives only as long as that ACP process.
- Interactive jobs (view, content, route) are picked before app jobs that have not started. A running job is not preempted. Order inside each class is FIFO.
- `SLOPOS_DATA_DIR` selects the data directory. It is read when the server process starts, so it has to be in the environment rather than applied later from `.env`. `SLOPOS_MOCK_MS` sets the mock stream length (default 6000).
- Per-kind model and effort: `SLOPOS_<P>_MODEL_<KIND>` and `SLOPOS_<P>_EFFORT_<KIND>`. For grok, content and route stay on the faster built-in default unless that kind override is set. Codex and claude omit `-m` / `model` when the model is unset, so the CLI's own default is used. Their effort is low for content and route and medium for app and view unless overridden. Grok also applies model and effort with `session/set_config_option` (`model`, `reasoning_effort`) after the session opens, because the user's CLI config wins over `--reasoning-effort` in ACP mode.
- Job timeouts: app 10 min, view 5 min, content 90 s, route 60 s. `SLOPOS_TIMEOUT_MS_<KIND>` overrides that kind. `SLOPOS_TIMEOUT_MS` is the fallback for kinds without their own value.
- Fixture apps under `fixtures/apps/` load only when `SLOPOS_FIXTURES=1`, are marked `fixture: true`, and `DELETE` on them returns 403. A generated app with the same id wins.
- The shell persists `windows[].restore` (the rect to return to after zoom) along with the fields in the settings paragraph.
- Each saved window may also carry `screens`: the in-window stack (`{ id, title, viewId, intent?, params?, context? }[]`), written by the app via `screens.state` and restored into the iframe on `ready`.
- `POST /api/gen`, `GET /api/jobs/:id/events`, and `GET /api/apps/:id/views/:viewId/bundle.js` are served by `server/generator/`. A cached hit is `{ cached: true, result }`; otherwise the response is `{ jobId }` and the job SSE ends with `{ type: 'done', result }`. Mock generations use `SLOPOS_GENERATOR=mock`. There is no `SLOPOS_GROK_MOCK` switch.

### Full screen ("jump into slopOS")
- Browser Fullscreen API on `document.documentElement`. Toggle from the logo menu ("Enter Full Screen" / "Exit Full
  Screen") and with Ctrl/Cmd+Shift+F (also Ctrl+Cmd+F on macOS if it reaches the page). Clean exit via Esc (native) or menu.
- When entering, also call `navigator.keyboard.lock()` where supported (Chromium): then the page receives Esc,
  Ctrl/Cmd+W, Ctrl+Tab etc., so Esc closes popovers/spotlight first and holding Esc (browser behaviour) exits full screen;
  release the lock on exit. Without Keyboard Lock (Safari/Firefox) everything still works with Ctrl shortcuts.
- First load: an inviting "Enter slopOS" moment — a calm full-viewport welcome over the blurred desktop (logo,
  one line, primary "Enter slopOS" button that goes full screen, secondary "Stay in window" link). Shown once per
  browser (remember the choice in localStorage); the logo menu can always enter full screen later.
- Global shortcuts must work identically in full screen, including when focus is inside an app iframe (runtime forwards
  them).
