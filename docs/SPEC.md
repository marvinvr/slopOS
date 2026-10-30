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

## App format (every app is generated, one screen at a time)

slopOS ships NO built-in apps. The OS is only the shell. The drawer and Spotlight list a small catalog of ordinary-looking
apps (`web/src/shell/catalog.ts`) next to the installed ones; opening any name that is not installed generates it.

There is no whole-app generation. An app is its **first screen**, and every later screen is generated from an interaction:

```
manifest.json   { "id": "notes", "name": "Notes", "icon": "StickyNote", "description": "…",
                  "window": { "width": 760, "height": 520, "minWidth": 360, "minHeight": 240, "resizable": true },
                  "version": 1, "createdAt": "…", "updatedAt": "…", "prompt": "…", "prompts": [ … history … ] }
app.tsx         the first screen, `export default function App() { … }`
views/<viewId>/view.tsx   every later screen, `export default function View() { … }`
```

- Screens are static: kit components and `var(--slop-…)` tokens, realistic content, no handlers, state, effects, or data
  loading. They may ONLY import from `react` and `@slop/sdk`.
- `icon` is a lucide icon name (PascalCase). The shell renders it on a rounded tile with a stable per-app tint.
- Apps live in `data/apps/<id>/` (+ `versions/<n>.tsx` for the first screen, `views/` for the rest). Test fixtures in
  `fixtures/apps/` are hand-written interactive apps, only loaded when `SLOPOS_FIXTURES=1`.

## Runtime & sandbox

- Each open window hosts its app in an `<iframe sandbox="allow-scripts allow-forms allow-modals allow-popups">`
  (NO `allow-same-origin`) whose src is `/runtime/frame.html?app=<id>&v=<version>`.
- `frame.html` loads a shared runtime bundle (React, ReactDOM, the SDK + component kit) and then the
  compiled app module `/api/apps/<id>/bundle.js?v=<version>` (server-side esbuild: TSX → ESM, with
  `react` / `react/jsx-runtime` / `@slop/sdk` mapped to the runtime's globals, e.g. via an import map pointing at
  runtime-served ESM shims). Responses for runtime/bundles carry `Access-Control-Allow-Origin: *`
  (the sandboxed frame has a `null` origin).
- `GET /runtime/frame.html` carries a `Content-Security-Policy` response header (no `<meta>` policy —
  `frame-ancestors` is ignored in a meta tag):
  `default-src 'self'; script-src 'self' 'sha256-…'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'self'`.
  Each inline script is allowed by a sha256 of its body (today that is the import map), computed from the HTML that is served. External modules
  (`bootstrap.js`, the import-map targets, app and view bundles) are `'self'`. Scripts do not get
  `'unsafe-inline'` or `blob:`. Styles do: kit and app `<style>` tags are inline, stylesheets are same-origin.
  `connect-src 'self'` blocks `fetch('https://…')`, WebSockets, and other cross-origin connections from the app.
  `slopFetch` still works: the app does not fetch the URL itself; it `postMessage`s the shell, and the shell
  calls `POST /api/proxy`. `download()` and `clipboard.write` are the same kind of host action. Remote images,
  fonts, and stylesheets are refused. `data:` and `blob:` images are allowed.
- Host ⇄ app communication is ONLY via `postMessage` with a small typed protocol
  (`{ slop: 1, type, id?, payload }`), request/response matched by `id`. Message types (extend as needed):
  `ready`, `theme`, `setTitle`, `setSize`, `close`, `notify`, `storage.get|set|remove|keys|read`,
  `fetch` (server proxy), `menu.set`, `menu.invoke`, `error`, `focus`, `keydown` (forward global shortcuts like
  Cmd/Ctrl+Space and Cmd/Ctrl+W from inside the frame to the shell).
- App crashes (render errors via an error boundary, uncaught errors, unhandled rejections) are reported to
  the host as `error` with message + stack. The window shows "<App> quit unexpectedly." with Reopen, which sends the
  error to the fix pipeline (the first screen is regenerated).

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
  run(opts: { prompt: string; cwd: string; kind: 'app'|'view'|'content'; jsonSchema?: object;
              resumeSessionId?: string; freshSession?: boolean; sessionKey?: string;
              signal: AbortSignal; timeoutMs: number; model: string; effort: string }): AsyncIterable<GenEvent>
}
type GenEvent = { type: 'status'|'thinking'|'text'|'tool'|'log'; text: string }
              | { type: 'end'; sessionId?: string; output?: string /* the whole answer */; usage?: object }
              | { type: 'error'; message: string; auth?: boolean }
```

**One path per provider, no fallbacks:** grok = ACP only, claude = Claude Agent SDK only, codex = `codex exec --json` only.
No silent fallback between providers or modes; failures surface as clear errors in the UI.

**Single-shot, no tools.** Every turn is one answer. The model never reads or writes files; the server writes them.

Providers (selected by `SLOPOS_GENERATOR`, default `grok`; each with `SLOPOS_<P>_BIN`, `SLOPOS_<P>_MODEL`, `SLOPOS_<P>_EFFORT`):
- **grok** (default): a long-lived `grok agent stdio` process (Grok CLI ACP mode, SuperGrok login, no API key) driven with
  `@agentclientprotocol/sdk` (initialize, session/new, session/prompt with streaming session/update, session/cancel).
  The client advertises no file system and refuses every permission request. `session/new` passes
  `_meta.systemPromptOverride`: the screen rule (answer with two fenced blocks, no tools) or the JSON-only rule for content.
  After `session/new` and an in-memory resume, slopOS calls `session/set_config_option` for `model` and
  `reasoning_effort` (the CLI flag loses to the user's own config in ACP mode). Child env adds `GROK_CLAUDE_MCPS_ENABLED=0`
  and `GROK_MEMORY=0`. Restart the process if it dies; there is NO `grok -p` fallback.
- **codex**: `codex exec --json --skip-git-repo-check --ignore-rules -C <workspace> --sandbox read-only -c model_reasoning_effort=<effort> -c approval_policy="never"`, prompt on stdin (`-`), `-m` only when set. A repair turn is `codex exec <flags> resume <sessionId> -`. Content adds `--output-schema <file> -o <file>` with a strict copy of the schema.
- **claude**: `@anthropic-ai/claude-agent-sdk` `query()` on the local Claude Code login. `tools: []`, `canUseTool` denies everything, `permissionMode: dontAsk`, `settingSources: []`, `mcpServers: {}`, `maxTurns` 2. System prompt is the `claude_code` preset plus the screen rule or the JSON-only rule. Content passes `outputFormat: { type: 'json_schema', schema }`. A repair turn passes `resume`.
- **mock**: `SLOPOS_GENERATOR=mock` — canned single-shot answers for every kind (tests, screenshots).

**Common pipeline** (provider-independent). The prompt is small: the screen rules (static, every control looks real),
a compact kit and token list, the world digest, and the task. The answer is exactly two fenced blocks: a `json` block
(first screen: `name`, `icon`, `description`, `title`, `window`, `entities`; later screens: `title`, `entities`) and a
`tsx` block with the whole source. The server parses them, checks the imports and the default export, and compiles with
esbuild. On a compile error it resumes the same session with only the errors and asks for both blocks again, up to
three attempts. Edit (Customize) and fix send the current first-screen source and get the whole new source back.
Regenerate (Reinstall) designs the first screen afresh.
Job queue with concurrency `SLOPOS_CONCURRENCY` (default 4). Timeouts per kind: app 10 min (`SLOPOS_TIMEOUT_MS_APP`),
view 5 min (`SLOPOS_TIMEOUT_MS_VIEW`), content 90 s (`SLOPOS_TIMEOUT_MS_CONTENT`); `SLOPOS_TIMEOUT_MS` covers any kind
without its own. Availability probe at startup, cached 60 s; auth failures give a clear "<Provider> isn't signed in"
state and are never worked around.

All slopOS env vars use the `SLOPOS_` prefix (e.g. `SLOPOS_FIXTURES=1`, `SLOPOS_GENERATOR`, `PORT`).

## The infinite world (core architecture — see BRIEF.md › Core idea)

slopOS is a world that materializes as you use it, one screen at a time. The model's job is always the same:
"here is the screen and what the person just did; render the screen that comes next".

| kind      | what the model returns                                  | rendered where                                  |
|-----------|---------------------------------------------------------|-------------------------------------------------|
| `app`     | the first screen of a new app (meta json + App source)  | a new window, listed in the drawer and Spotlight |
| `view`    | the next screen after an interaction (meta + View source) | replaces the current screen in the same window |
| `content` | JSON matching a schema the caller supplies              | returned to the calling code (`useGenerated`)    |

`auto` (Spotlight, the drawer, a typed name) never runs a routing model: a local match opens an existing app when one
score is at least 80 and leads the next by 15 (exact name 100, exact storage key or its single-word plural 92, every name
word present in a short intent 80). Anything else is created as a new app.

**Interactions.** The runtime catches every interaction on a generated screen in the capture phase, before any handler:
clicks on buttons, links, tabs, chips, list rows, clickable cards, switches; Enter in an input (Cmd/Ctrl+Enter in a
text area); changes of selects, checkboxes, radios and sliders; form submits. It sends `gen.request` with
`kind: 'view'`, an intent such as `Clicked “Add habit”` or `Typed “Read 20 pages” in New habit and pressed Enter`, and a
context of `{ from: <viewId | 'root'>, title, interaction, values: [{ field, value }], shown: <visible text, ≤2500 chars> }`.
The server inlines the source of the `from` screen. Fixtures load with `capture=0` and keep their own handlers.

**Cache.** The runtime passes `key = <appId>:<from>:<hash(interaction, values)>`, so the same screen plus the same
interaction returns the stored screen at once. Reload (the ↻ in the screen bar) and Try Again pass `fresh`.

**History.** Each window keeps a back stack and a forward list of screens (`screens.state` persists both; forward items
carry `ahead: true`, newest 24 kept). The screen bar shows back, forward, the screen title and Reload whenever there is
history. Cmd/Ctrl+[ and ] (or Alt+←/→) go back and forward. While the next screen loads, the window shows a quiet
skeleton with a thin accent gleam under the bar.

### SDK surface the model needs

Only the kit components and tokens; the prompt lists them. Screens wire nothing. The rest of `@slop/sdk`
(`useStorage`, `useWindow`, `useMenu`, `notify`, `slopFetch`, `useAppData`, `generate`, `useGenerated`, `useGenContext`)
stays for hand-written apps and fixtures.

### Host ⇄ app protocol additions

`gen.request {requestId, req}` (app → host) · `gen.result {requestId, result}` · `gen.error {requestId, error}`
(host → app) · `screens.state {stack}` (app → host, persisted with the window) · `screens.restore`, `screens.push`
(host → app). `gen.progress` is not forwarded to apps.

### Server

```
POST /api/gen {appId?, windowId?, kind, intent, context, schema?, key?, fresh?}
     → { cached: true, result } | { jobId }      (job SSE ends with { type:'done', result })
GET  /api/apps/:id/views/:viewId/bundle.js        a compiled generated screen
GET  /api/world                                   world digest (debug / shell)
POST /api/reset {confirm: "RESET"}                wipe the whole generated world → pristine start
```

- **Cache & consistency:** cache key = `key` when passed, else hash(appId | kind | normalized intent | `context.scope`).
  Same key → same stored result instantly unless `fresh`. In-flight identical requests share one job.
- **World store** (`data/world/`): app summaries, entities the model invented (from the meta block), the screens and the
  generation log. Every prompt gets a capped world digest so names and facts stay consistent across apps and screens.
- **Models per kind** (overridable, e.g. `SLOPOS_GROK_MODEL_VIEW`): grok app and view use `SLOPOS_GROK_MODEL` /
  `SLOPOS_GROK_EFFORT` (default `grok-4.7`/medium), grok content `grok-4.7-build-fast`/low. Codex and Claude omit the
  model; effort medium for app and view, low for content. Interactive view and content jobs start before queued app jobs.
- **Persistence = continue where you left off:** apps, screens, content, world, open windows with geometry and each
  window's back/forward history survive restarts and reloads.
- **Reset slopOS:** logo menu → confirm → `POST /api/reset` → server wipes `data/` → shell clears its localStorage and
  reloads into the pristine first run.

## Shell behaviour (summary)

Nothing in the shell labels or explains generation. Menu bar (top): logo menu (About slopOS, appearance, full screen,
reload, reset), active app name (bold), app menus (from `useMenu` + Window menu + App menu: Customize…, Reinstall,
Version History…, Delete), status icons, clock (click → small calendar popover). Dock: pinned and running apps plus the
drawer button; a window that is still opening shows a neutral tile that bounces briefly. Opening anything opens its
window at once with a neutral skeleton; the app appears in that window when it lands, and several launches open several
windows side by side. Spotlight (Cmd/Ctrl+Space, also Cmd/Ctrl+K): a plain search field; empty, it lists a handful of
apps; typing lists Applications (an unknown name shows as an ordinary app), Places, Documents, Actions. Drawer: a
Launchpad-style grid with the search field on top; a name nothing matches shows as an ordinary app tile. Shortcuts:
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
- Grok content turns do not use `--json-schema`. ACP has no schema flag, so the schema is in the prompt and the server checks the JSON (one retry). Codex uses `--output-schema`. Claude uses the Agent SDK `outputFormat`. For those two, the schema copy requires every object property and sets `additionalProperties` to false.
- `session/load` is used only when the Grok agent advertises `loadSession`. Otherwise the session id lives only as long as that ACP process.
- Interactive jobs (view, content) are picked before app jobs that have not started. A running job is not preempted. Order inside each class is FIFO.
- `SLOPOS_DATA_DIR` selects the data directory. It is read when the server process starts, so it has to be in the environment rather than applied later from `.env`. `SLOPOS_MOCK_MS` sets the mock stream length (default 6000).
- Per-kind model and effort: `SLOPOS_<P>_MODEL_<KIND>` and `SLOPOS_<P>_EFFORT_<KIND>`. For grok, content stays on the faster built-in default unless that kind override is set. Codex and claude omit `-m` / `model` when the model is unset, so the CLI's own default is used. Their effort is low for content and medium for app and view unless overridden. Grok also applies model and effort with `session/set_config_option` (`model`, `reasoning_effort`) after the session opens, because the user's CLI config wins over `--reasoning-effort` in ACP mode.
- Job timeouts: app 10 min, view 5 min, content 90 s. `SLOPOS_TIMEOUT_MS_<KIND>` overrides that kind. `SLOPOS_TIMEOUT_MS` is the fallback for kinds without their own value.
- Fixture apps under `fixtures/apps/` load only when `SLOPOS_FIXTURES=1`, are marked `fixture: true`, and `DELETE` on them returns 403. A generated app with the same id wins.
- The shell persists `windows[].restore` (the rect to return to after zoom) along with the fields in the settings paragraph.
- Each saved window may also carry `screens`: its history (`{ id, title, viewId, intent?, context?, key?, ahead? }[]`, back stack first, forward items marked `ahead`), written by the app via `screens.state` and restored into the iframe on `ready`.
- `POST /api/gen`, `GET /api/jobs/:id/events`, and `GET /api/apps/:id/views/:viewId/bundle.js` are served by `server/generator/`. A cached hit is `{ cached: true, result }`; otherwise the response is `{ jobId }` and the job SSE ends with `{ type: 'done', result }`. Mock generations use `SLOPOS_GENERATOR=mock`. There is no `SLOPOS_GROK_MOCK` switch.

### Full screen ("jump into slopOS")
- Browser Fullscreen API on `document.documentElement`. Toggle from the logo menu ("Enter Full Screen" / "Exit Full
  Screen") and with Ctrl/Cmd+Shift+F (also Ctrl+Cmd+F on macOS if it reaches the page). Clean exit via Esc (native) or menu.
- When entering, also call `navigator.keyboard.lock()` where supported (Chromium): then the page receives Esc,
  Ctrl/Cmd+W, Ctrl+Tab etc., so Esc closes popovers/spotlight first and holding Esc (browser behaviour) exits full screen;
  release the lock on exit. Without Keyboard Lock (Safari/Firefox) everything still works with Ctrl shortcuts.
- There is no welcome screen: slopOS boots straight to the desktop. Full screen is in the logo menu and on the shortcut.
- Global shortcuts must work identically in full screen, including when focus is inside an app iframe (runtime forwards
  them).
