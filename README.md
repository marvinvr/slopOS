# slopOS

A calm desktop in the browser. Apps are written by Grok, one React file at a time. This repo is the shell, the sandbox, and the design system they share.

There are no built-in apps. An empty desk invites the first one. About slopOS is a dialog in the logo menu.

## Run

```bash
npm install
npm start          # build, then listen on 0.0.0.0:4747
npm run dev        # shell on :5173, API + runtime on :4748
npm run typecheck
```

`npm start` must work from a clean checkout after `npm install`. Copy `.env.example` to `.env` if you want to override the port or Grok settings. Do not set `XAI_API_KEY` or `GROK_API_KEY`. slopOS uses the local `grok` subscription (pass C), never the xAI API.

Hidden fixture apps (Notes and Hello) load only when `SLOP_FIXTURES=1`. They are for tests and screenshots, not the product.

```bash
SLOP_FIXTURES=1 PORT=4790 node dist/server/index.js
```

## Layout

```
server/            HTTP server: shell, /runtime, /api
  apps/            registry, esbuild compile, per-app storage
  grok/            generation stub — pass C replaces this
web/src/shell/     desktop, windows, menu bar, dock
  spotlight/       pass A
  drawer/          pass A (empty state + a minimal launcher already work)
  generation/      pass C seam: startGeneration, fixApp, …
web/src/design/    tokens.css + the component kit
runtime/           iframe bootstrap and @slop/sdk
fixtures/apps/     hidden apps, loaded only with SLOP_FIXTURES=1
data/              generated apps, storage, settings (created at runtime, gitignored)
docs/APP_SDK.md    app contract, also the generation prompt's reference
docs/SPEC.md       engineering contract
```

`compileApp()` in `server/apps/compile.ts` is the validator pass C should call. It returns `{ ok: true, code }` or `{ ok: false, errors }`.

## Desktop

The menu bar has the logo (About, theme, accent, full screen, restart), the active app name, that app's menus, a Window menu, and the clock. The dock shows pinned apps, running apps, and the drawer button. With no apps it shows only the drawer button. The first visit offers Enter slopOS, which goes full screen (`Ctrl/Cmd+Shift+F` later).

Windows drag from the title bar, resize from every edge, and use the traffic lights. Geometry is saved through `/api/settings`. Ctrl and Cmd both work for Space / K (spotlight), W (close), M (minimize), and backtick (cycle).
