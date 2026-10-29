# slopOS

A calm desktop in the browser. Apps are written by Grok, one React file at a time. This repo is the shell, the sandbox, and the design system they share.

There are no built-in apps. An empty desk invites the first one. About slopOS is a dialog in the logo menu.

## Run

```bash
npm install
npm start          # build, then listen on 0.0.0.0:4747
npm run dev        # shell on :5173, API + runtime on :4748
npm run typecheck
npm run test:gen   # generation pipeline, mock provider, temporary data dir
```

`npm start` must work from a clean checkout after `npm install`. Copy `.env.example` to `.env` if you want to override the port or the generator. Do not set an API key. slopOS runs a local subscription CLI (`grok` by default, or `codex` / `claude`). It never calls a vendor HTTP API.

Hidden fixture apps (Notes and Hello) load only when `SLOPOS_FIXTURES=1`. They are for tests and screenshots, not the product.

```bash
SLOPOS_FIXTURES=1 PORT=4790 node dist/server/index.js
```

## Layout

```
server/            HTTP server: shell, /runtime, /api
  apps/            registry, esbuild compile, per-app storage
  generator/       pluggable generation pipeline (grok, codex, claude, mock)
web/src/shell/     desktop, windows, menu bar, dock
  spotlight/       pass A
  drawer/          pass A (empty state + a minimal launcher already work)
  generation/      generation panel, edit dialog, menu-bar activity
web/src/design/    tokens.css + the component kit
runtime/           iframe bootstrap and @slop/sdk
fixtures/apps/     hidden apps, loaded only with SLOPOS_FIXTURES=1
data/              generated apps, storage, settings (created at runtime, gitignored)
docs/APP_SDK.md    app contract, also the generation prompt's reference
docs/SPEC.md       engineering contract
```

`compileApp()` in `server/apps/compile.ts` validates a generated file. It returns `{ ok: true, code }` or `{ ok: false, errors }`.

## Generation

`SLOPOS_GENERATOR` selects the provider (`grok` by default, also `codex`, `claude`, or `mock`). Each provider is one path: grok speaks ACP over `grok agent stdio`, codex runs `codex exec --json`, and claude uses the Claude Agent SDK. There is no fallback between them and no API key.

The child environment is the server environment with vendor API keys removed. Grok also gets `GROK_CLAUDE_MCPS_ENABLED=0` and `GROK_MEMORY=0`. Tools stay inside the app workspace: read, write, and edit. Shell, web, and subagents are denied.

`GET /api/health` reports `{ ok, grok: { available, loggedIn, model, effort, reason, provider } }`. The field is still named `grok` so the shell can keep one status object; `provider` says which CLI is active. If the login is missing, the reason tells you to run that CLI once in a terminal.

Jobs are queued (`SLOPOS_CONCURRENCY`, default 2). View, content, and routing jobs start before app jobs that are still waiting. `GET /api/jobs/:id/events` replays the log, then streams. Create, edit, and fix resume the same app conversation when the provider can. A compile failure is sent back, up to three attempts.

`POST /api/gen` accepts `kind: auto | app | view | content`. Cached results return immediately. `POST /api/reset` with `{ "confirm": "RESET" }` stops jobs and deletes `data/`.

`npm run test:gen` runs the pipeline in mock mode against a temporary directory. Set `SLOPOS_MOCK_MS` to shorten the fake stream. A prompt containing "broken" fails compilation once so the fix loop runs. "pomodoro" or "timer" builds a timer; anything else builds a to-do list.

## Desktop

The menu bar has the logo (About, theme, accent, restart), the active app name, that app's menus, a Window menu, and the clock. The dock shows pinned apps, running apps, and the drawer button. With no apps it shows only the drawer button. Full screen is pass A's; the runtime already forwards Ctrl/Cmd+Shift+F and an unhandled Escape to `web/src/shell/shortcuts.ts`.

Windows drag from the title bar, resize from every edge, and use the traffic lights. Geometry is saved through `/api/settings`. Ctrl and Cmd both work for Space / K (spotlight), W (close), M (minimize), and backtick (cycle).
