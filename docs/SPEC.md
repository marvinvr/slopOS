# slopOS — shared engineering spec

Read `BRIEF.md` first (the product brief). Its React + `@slop/sdk` app format is superseded: screens are HTML now (see App format). This file is the contract every contributor follows.
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

The shell and design kit speak this language. Generated screens get much more freedom (their own layout, palette, type
and motion); the prompt asks for something striking that still fits a slightly creative macOS-like desk, and the OS
fonts, accent and light/dark theme are available to them.

## Open source

slopOS is public (github.com/marvinvr/slopOS, MIT). Never commit secrets, `.env`, `data/` (the world store), absolute
paths from a developer machine (`/Users/...`), usernames, or anything machine-specific. Resolve CLIs from PATH (with
`SLOPOS_<P>_BIN` overrides), paths relative to the repo / `process.cwd()`. Contributors commit locally; the orchestrator
reviews and pushes.

## Repo layout

```
package.json            single package (npm workspaces NOT used); scripts below
tsconfig.json
vite.config.ts          builds the shell (web/)
vite.runtime.config.ts  builds the screen runtime (runtime/hook.ts + screen.css) as one classic script
server/                 Node + TypeScript HTTP server (plain node:http + small router)
  index.ts              serves dist/web, /runtime/*, /api/*; listens 0.0.0.0:${PORT:-4747}
  apps/                 app registry, the screen document + its CSP
  generator/            providers, job queue, prompts, world store
web/                    the desktop shell (React 18 + TS + Vite)
  src/shell/            desktop, menu bar, dock, spotlight, drawer, window manager, screen history
  src/design/           tokens.css + the shell's component kit
runtime/                code that runs INSIDE a screen: the interaction hook, screen.css, the optional React + htm module
scripts/                build-runtime.mjs (vendor files), precompress.mjs, test-generation.ts
data/                   runtime data, gitignored (generated apps, screens, world, settings)
docs/SPEC.md            this file
```

Scripts:
- `npm run build` — build shell + runtime (vite, then `scripts/build-runtime.mjs`) and the server (esbuild → `dist/server`).
- `npm run start` — `npm run build` then `node dist/server/index.js` (port 4747, host 0.0.0.0).
  Must work from a clean checkout after `npm install`.
- `npm run dev` — vite dev server on 5173 proxying `/api` + `/runtime` to a server on 4748 (tsx watch).
- `npm run typecheck` — `tsc --noEmit` for all parts.
- `npm run test:gen` — the generation pipeline against the mock provider.

Dependencies: keep them few and boring. Shell: React 18, Vite, lucide-react, nanoid, zustand. Screens: the Tailwind v4
browser build, Lucide icon data (inlined per screen by the server), React + htm (optional module). esbuild only builds
slopOS itself; nothing is compiled at generation time.

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

The same `tokens.css` is loaded into every screen (`/runtime/screen.css`), and the current theme (light/dark + accent)
is set on the screen's `<html data-theme>` before it paints and pushed in live when it changes.

## App format (every app is generated, one screen at a time)

slopOS ships NO built-in apps. The OS is only the shell. The drawer and Spotlight list a small catalog of ordinary-looking
apps (`web/src/shell/catalog.ts`) next to the installed ones; opening any name that is not installed generates it.

There is no whole-app generation. An app is its **first screen**, and every later screen is generated from an interaction:

```
manifest.json   { "id": "notes", "name": "Notes", "icon": "StickyNote", "description": "…",
                  "window": { "width": 760, "height": 520, "minWidth": 360, "minHeight": 240, "resizable": true },
                  "version": 1, "createdAt": "…", "updatedAt": "…", "prompt": "…", "prompts": [ … history … ] }
index.html      the first screen (+ versions/<n>.html)
views/<viewId>/view.html   every later screen (+ meta.json)
```

- A screen is the inside of `<body>`: markup, optional `<style>`, optional `<script>`. The model picks freely per screen
  what it needs, all from local copies, no CDN:
  - **Tailwind CSS v4** (browser build, `/runtime/tailwind.js`) for styling with utility classes. The screen head adds
    `dark:` on `[data-theme=dark]` and the theme names `accent`, `font-sans` (Inter), `font-display` (Fraunces),
    `font-mono` (JetBrains Mono).
  - **Lucide icons**: `<i data-lucide="name">`. The server inlines only the SVGs a screen names; the hook places them,
    also into nodes a script adds later.
  - **Plain scripts** for local life (animation, canvas, clocks), or **React + htm** for components and state:
    `import { html, render, useState } from '/runtime/react.js'` in a `<script type="module">`. No JSX, no compile step.
- The model names its palette once (`@theme` colors in a `<style type="text/tailwindcss">` block) and uses `@apply` for
  repeated looks; that keeps answers short, and answer length is what generation time follows.
- A next screen is stored with the `<style>` blocks of the screen it came from in front (unless it repeats one), so it
  keeps the app's look and the model only writes the styles that are new.
- Content is realistic and specific. Controls that should lead somewhere are links, buttons, roles or carry
  `data-action="what it does"`; controls the screen's own script handles carry `data-local`.
- `icon` is a lucide icon name (PascalCase). The shell renders it on a rounded tile with a stable per-app tint.
- An app from the older TSX format (no `index.html`) is listed with `stale: true`; opening it reinstalls it (the first
  screen is generated afresh and the window's old history is dropped).

## Runtime & sandbox

- Each window's iframe loads the current screen as its own document: `/api/apps/<id>/screens/<root|viewId>?v=<version>&win=<windowId>&theme=…&accent=…`,
  with `sandbox="allow-scripts allow-forms allow-modals"` (NO `allow-same-origin`, no popups). Every navigation is a
  fresh document, so nothing of one screen's scripts or styles leaks into the next.
- The server wraps the stored HTML: `<head>` gets `/runtime/screen.css` (fonts + tokens), `/runtime/hook.js` (first, a
  classic IIFE), `/runtime/tailwind.js`, the Tailwind theme block, and the screen's icon SVGs.
- The screen response carries this `Content-Security-Policy`:
  `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src data: blob:; font-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'`.
  Inline scripts run (that is the point), but nothing reaches the network: no fetch, WebSocket, remote script, font,
  image or stylesheet, and forms cannot post anywhere. `/runtime/*` responses carry `Access-Control-Allow-Origin: *`
  (the sandboxed frame has a `null` origin).
- The hook (`runtime/hook.ts`, ~6 KB) applies the theme, places icons, forwards global shortcuts
  (Cmd/Ctrl+Space, Cmd/Ctrl+W, unhandled Escape, …) and history keys, and reports interactions. It posts `ready` two
  frames after the DOM is in, so the shell lifts its placeholder onto a painted screen.
- Host ⇄ screen communication is ONLY via `postMessage` (`{ slop: 1, type, winId?, payload }`):
  screen → shell `ready`, `interact { interaction, values, shown }`, `nav { to: 'back'|'forward' }`, `keydown`, `keyup`;
  shell → screen `theme { mode, accent }`. A screen's own script errors stay in that screen.

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
  run(opts: { prompt: string; cwd: string; kind: 'app'|'view'; signal: AbortSignal; timeoutMs: number; model: string; effort: string }): AsyncIterable<GenEvent>
}
type GenEvent = { type: 'status'|'thinking'|'text'|'tool'|'log'; text: string }
              | { type: 'end'; output?: string /* the whole answer */; usage?: object }
              | { type: 'error'; message: string; auth?: boolean }
```

**One path per provider, no fallbacks:** grok = ACP only, claude = Claude Agent SDK only, codex = `codex exec --json` only.
No silent fallback between providers or modes; failures surface as clear errors in the UI.

**Single-shot, no tools, no sessions to resume.** Every generation is one fresh turn with one answer. The model never
reads or writes files; the server writes them.

Providers (selected by `SLOPOS_GENERATOR`, default `grok`; each with `SLOPOS_<P>_BIN`, `SLOPOS_<P>_MODEL`, `SLOPOS_<P>_EFFORT`):
- **grok** (default): a long-lived `grok agent stdio` process (Grok CLI ACP mode, SuperGrok login, no API key) driven with
  `@agentclientprotocol/sdk` (initialize, session/new, session/prompt with streaming session/update, session/cancel).
  The client advertises no file system and refuses every permission request. Each turn opens a new session whose
  `_meta.systemPromptOverride` is the screen rule (answer with two fenced blocks, no tools), then calls
  `session/set_config_option` for `model` and `reasoning_effort` (the CLI flag loses to the user's own config in ACP mode).
  Child env adds `GROK_CLAUDE_MCPS_ENABLED=0` and `GROK_MEMORY=0`. Restart the process if it dies; there is NO `grok -p` fallback.
- **codex**: `codex exec --json --skip-git-repo-check --ignore-rules -C <workspace> --sandbox read-only -c model_reasoning_effort=<effort> -c approval_policy="never"`, prompt on stdin (`-`), `-m` only when set.
- **claude**: `@anthropic-ai/claude-agent-sdk` `query()` on the local Claude Code login. `tools: []`, `canUseTool` denies everything, `permissionMode: dontAsk`, `settingSources: []`, `mcpServers: {}`, no persisted session. System prompt is the `claude_code` preset plus the screen rule.
- **mock**: `SLOPOS_GENERATOR=mock` — canned single-shot answers (tests, screenshots).

**Common pipeline** (provider-independent). The prompt is small: the screen rules (what is loaded, how interactions are
caught, a size budget), the world digest, and the task. The answer is exactly two fenced blocks: a `json` block (first
screen: `name`, `icon`, `description`, `title`, `window`, `entities`; later screens: `title`, `entities`) and an `html`
block with the screen. The server stores the HTML as it is: nothing to compile, check or repair. An answer without a
screen fails the job, and Try Again asks once more. Edit (Customize) sends the current first screen and gets the whole new
screen back. Regenerate (Reinstall) designs the first screen afresh. Edit, Reinstall and restoring a version drop the
app's cached next screens.
Job queue with concurrency `SLOPOS_CONCURRENCY` (default 4). Timeouts per kind: app 10 min (`SLOPOS_TIMEOUT_MS_APP`),
view 5 min (`SLOPOS_TIMEOUT_MS_VIEW`); `SLOPOS_TIMEOUT_MS` covers any kind without its own. Availability probe at
startup, cached 60 s; auth failures give a clear "<Provider> isn't signed in" state and are never worked around.

All slopOS env vars use the `SLOPOS_` prefix (e.g. `SLOPOS_GENERATOR`, `SLOPOS_DATA_DIR`, `PORT`).

## The infinite world (core architecture — see BRIEF.md › Core idea)

slopOS is a world that materializes as you use it, one screen at a time. The model's job is always the same:
"here is the screen and what the person just did; render the screen that comes next".

| kind      | what the model returns                                  | rendered where                                  |
|-----------|---------------------------------------------------------|-------------------------------------------------|
| `app`     | the first screen of a new app (meta json + HTML)        | a new window, listed in the drawer and Spotlight |
| `view`    | the next screen after an interaction (meta json + HTML) | replaces the current screen in the same window   |

`auto` (Spotlight, the drawer, a typed name) never runs a routing model: a local match opens an existing app when one
score is at least 80 and leads the next by 15 (exact name 100, exact storage key or its single-word plural 92, every name
word present in a short intent 80). Anything else is created as a new app.

**Interactions.** The hook catches every meaningful interaction in the capture phase on `window`, before the screen's own
handlers: clicks on links, buttons, `[role=button|link|tab|option|menuitem|switch|checkbox|radio]` and `[data-action]`;
Enter in an input (Cmd/Ctrl+Enter in a text area); changes of selects, checkboxes, radios, sliders and date/time fields;
form submits. Anything inside `[data-local]` is left to the screen. The hook posts `interact` with the interaction
(`data-action` text, else aria-label, title or text), the field values and the visible text (≤2500 chars). The shell
turns it into `kind: 'view'` with an intent such as `Clicked “Add habit”` or `Typed “Read 20 pages” in New habit and pressed Enter`,
and a context of `{ from: <viewId | 'root'>, title, interaction, values: [{ field, value }], shown }`. The server inlines
the HTML of the `from` screen (scripts dropped when it is very long).

**Cache.** The shell passes `key = <appId>:<from>:<hash(interaction, values)>`, so the same screen plus the same
interaction returns the stored screen at once. Reload (the ↻ in the screen bar) and Try Again pass `fresh`.

**History.** The shell owns it (`web/src/shell/window/screens.ts`). Each window keeps a back stack and a forward list of
screens in `win.screens` (persisted with the window; forward items carry `ahead: true`, newest 24 kept) plus the one
screen it is waiting for. The screen bar under the title bar shows back, forward, the screen title and Reload whenever
there is history. Cmd/Ctrl+[ and ] (or Alt+←/→) go back and forward, also from inside a screen. While the next screen
loads, the window shows the quiet skeleton with a thin accent gleam under the bar; Back cancels the wait.

### Server

```
POST /api/gen {appId?, windowId?, kind: 'auto'|'app'|'view', intent, context?, key?, fresh?}
     → { cached: true, result } | { jobId }      (job SSE ends with { type:'done', result })
GET  /api/apps/:id/screens/:viewId                a screen document (`root` = the first screen)
GET  /api/world                                   world digest (debug / shell)
POST /api/reset {confirm: "RESET"}                wipe the whole generated world → pristine start
```

- **Cache & consistency:** cache key = `key` when passed, else hash(appId | kind | normalized intent | `context.scope`).
  Same key → same stored result instantly unless `fresh`. In-flight identical requests share one job.
- **World store** (`data/world/`): app summaries, entities the model invented (from the meta block), the screens and the
  generation log. Every prompt gets a capped world digest so names and facts stay consistent across apps and screens.
- **Models per kind** (overridable, e.g. `SLOPOS_GROK_MODEL_VIEW`): `SLOPOS_<P>_MODEL` / `SLOPOS_<P>_EFFORT`
  (grok default `grok-4.7`/medium; Codex and Claude omit the model and use effort medium). Interactive view jobs start
  before queued app jobs.
- **Persistence = continue where you left off:** apps, screens, world, open windows with geometry and each window's
  back/forward history survive restarts and reloads.
- **Reset slopOS:** logo menu → confirm → `POST /api/reset` → server wipes `data/` → shell clears its localStorage and
  reloads into the pristine first run.

## Shell behaviour (summary)

Nothing in the shell labels or explains generation. Menu bar (top): logo menu (About slopOS, appearance, full screen,
reload, reset), active app name (bold), Window menu, App menu (Customize…, Reinstall, Version History…, Delete), status icons, clock (click → small calendar popover). Dock: pinned and running apps plus the
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

- `GET /api/apps` returns a JSON array of manifests. `GET /api/apps/:id` returns `{ manifest, html }`.
- Generation is implemented in `server/generator/`. Health is `{ ok, grok: { available, loggedIn, model, effort, reason, provider } }`. The object is still called `grok`; `provider` is `grok`, `codex`, `claude`, or `mock`.
- `SLOPOS_DATA_DIR` selects the data directory. It is read when the server process starts, so it has to be in the environment rather than applied later from `.env`. `SLOPOS_MOCK_MS` sets the mock stream length (default 6000).
- Per-kind model and effort: `SLOPOS_<P>_MODEL_<KIND>` and `SLOPOS_<P>_EFFORT_<KIND>` (`APP`, `VIEW`). Codex and claude omit `-m` / `model` when the model is unset, so the CLI's own default is used.
- Job timeouts: app 10 min, view 5 min. `SLOPOS_TIMEOUT_MS_<KIND>` overrides that kind. `SLOPOS_TIMEOUT_MS` is the fallback for kinds without their own value.
- The shell persists `windows[].restore` (the rect to return to after zoom) along with the fields in the settings paragraph.
- Each saved window may also carry `screens`: its history (`{ id, title, viewId, intent?, context?, key?, ahead? }[]`, back stack first, forward items marked `ahead`).
- The window's iframe `src` carries the theme only for the first paint of that screen; later theme changes are messages, so a theme switch never reloads a screen.
- Removed with the HTML screens: the TSX/esbuild pipeline and its repair rounds, `@slop/sdk` and its storage, fetch proxy,
  menus and `content` generation, fixture apps, and the crash → Reopen → fix flow (a screen's script error stays inside it).

### Full screen ("jump into slopOS")
- Browser Fullscreen API on `document.documentElement`. Toggle from the logo menu ("Enter Full Screen" / "Exit Full
  Screen") and with Ctrl/Cmd+Shift+F (also Ctrl+Cmd+F on macOS if it reaches the page). Clean exit via Esc (native) or menu.
- When entering, also call `navigator.keyboard.lock()` where supported (Chromium): then the page receives Esc,
  Ctrl/Cmd+W, Ctrl+Tab etc., so Esc closes popovers/spotlight first and holding Esc (browser behaviour) exits full screen;
  release the lock on exit. Without Keyboard Lock (Safari/Firefox) everything still works with Ctrl shortcuts.
- There is no welcome screen: slopOS boots straight to the desktop. Full screen is in the logo menu and on the shortcut.
- Global shortcuts must work identically in full screen, including when focus is inside an app iframe (runtime forwards
  them).
