# slopOS

**A desktop in your browser where every app is written on the spot.**

slopOS is a calm, slightly playful take on a macOS-style desktop: menu bar, dock, windows with traffic lights, Spotlight, an app drawer. It ships with **no apps at all**. Open any app by name and a model (Grok by default, or Codex or Claude) draws its first screen as a piece of HTML: its own layout, look, motion and little scripts, styled with Tailwind. Everything you click, type or toggle in it asks for the next screen. Each screen runs sandboxed in the window and stays on your desk.

![slopOS demo: entering slopOS, asking Spotlight for an app, and clicking a button whose screen is generated on the fly](docs/demo.gif)

<sub>A real session with Grok (grok-4.7, medium effort). The waits are fast-forwarded: the app took about 2½ minutes and the generated Settings screen about a minute. Also available as <a href="docs/demo.mp4">MP4</a>.</sub>

## The idea: an infinite, procedurally generated world

Nothing is planned ahead. An app is only the screen you are looking at:

- **Opening an app** generates one polished first screen: no navigation architecture, no other screens.
- **Every interaction** on that screen (a button, a link, a clickable card, a tab, Enter in a field, a toggle, a form submit) is caught by a small hook inside the screen. The screen, what it showed, what was typed and what was clicked go to the model, which answers with the next screen. It replaces the current one in the same window, with back and forward.
- **Spotlight and the drawer** list your apps and a few ordinary ones. Typing a name that doesn't exist opens it like any other app.

It stays **coherent**. A world store remembers every app, the people, places and things that were invented, and the screens seen so far. Every generation gets a compact digest of it, and each screen carries over what the previous one showed. Results are cached: the same click on the same screen leads to the same screen.

It **persists**. Apps, screens, open windows and each window's back/forward history survive reloads and restarts. **Reset slopOS** in the logo menu wipes the world and returns to the pristine first start.

## Screenshots

| | |
|---|---|
| ![The empty desk on first start](docs/screenshots/desk-empty.jpg) | ![Spotlight offering to create an app](docs/screenshots/spotlight.jpg) |
| ![An app being generated, with live progress](docs/screenshots/generating.jpg) | ![A generated app](docs/screenshots/app.jpg) |
| ![A screen generated from a button click](docs/screenshots/generated-screen.jpg) | ![The app drawer in dark mode](docs/screenshots/drawer-dark.jpg) |

## Quick start

Requirements: Node 20+ and **one** generator CLI installed and signed in with your subscription:

| Provider | CLI | Sign in once with | Default model / effort |
|---|---|---|---|
| `grok` (default) | [Grok CLI](https://x.ai) `grok` | run `grok` and log in (SuperGrok) | `grok-4.7` / `medium` |
| `codex` | [Codex CLI](https://github.com/openai/codex) `codex` | `codex login` (ChatGPT) | CLI default / `medium` |
| `claude` | [Claude Code](https://claude.com/claude-code) `claude` | run `claude` and log in (Claude subscription) | CLI default / `medium` |

```bash
git clone https://github.com/marvinvr/slopOS.git
cd slopOS
npm install
cp .env.example .env      # optional: pick a provider, model, effort, port
npm start                 # builds, then serves on http://0.0.0.0:4747
```

Open http://localhost:4747, press **Ctrl+Space** and type the name of any app, installed or not. Full screen is in the logo menu (**Ctrl+Shift+F**).

**No API keys, ever.** slopOS only drives the local CLI you're already logged into. It never calls a vendor HTTP API, and it strips `XAI_API_KEY`, `GROK_API_KEY`, `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` from the generator's environment so nothing silently bills an API account. If the CLI is missing or signed out, slopOS still runs and tells you how to fix it.

Other scripts:

```bash
npm run dev            # shell on :5173 with hot reload, API + runtime on :4748
npm run typecheck
npm run test:gen       # the full generation pipeline against the mock provider
```

## Generator providers

`SLOPOS_GENERATOR` in `.env` selects one of `grok`, `codex`, `claude` or `mock`. Each provider has exactly one code path and there are no silent fallbacks: if it fails, the UI says so.

- **grok** runs a long-lived `grok agent stdio` process and speaks the [Agent Client Protocol](https://agentclientprotocol.com) to it (`@agentclientprotocol/sdk`). Model and reasoning effort are set per session. The client offers no file system and refuses every tool.
- **codex** runs `codex exec --json` with a read-only sandbox.
- **claude** uses the Claude Agent SDK with no tools and no user settings, skills or MCP servers loaded.
- **mock** produces canned answers for tests and screenshots.

Every generation is **single-shot**: one answer, with the screen's metadata as JSON and the screen as an `html` block. Nothing is compiled, so there is nothing to repair. The model never reads or writes files; the server writes them. Model and effort are configurable per provider and per kind of generation (`SLOPOS_GROK_MODEL`, `SLOPOS_GROK_EFFORT`, `SLOPOS_GROK_MODEL_VIEW`, …), and up to `SLOPOS_CONCURRENCY` jobs (default 4) run at once. See [`.env.example`](.env.example) for everything, including timeouts.

## How generated apps work

An app is a folder with a `manifest.json` (name, lucide icon, window size), **one `index.html`** for its first screen, and one `views/<id>/view.html` per later screen. A screen is the inside of `<body>`, and the model picks per screen what it needs, all served locally (no CDN, no network):

- **Tailwind CSS v4** (browser build) for styling, with `dark:` following the OS theme and the OS fonts and accent as `font-display`, `font-mono`, `bg-accent`;
- **Lucide icons** as `<i data-lucide="name">` (the server inlines just the SVGs a screen uses);
- **plain scripts** for local life, or **React + htm** (`import { html, render, useState } from '/runtime/react.js'`) when it wants components and state. No JSX, no build step.

```html
<div class="min-h-screen bg-gradient-to-br from-amber-50 to-rose-100 p-6 dark:from-stone-900 dark:to-stone-800">
  <nav data-nav="main" class="flex gap-4 text-sm">
    <a data-screen="today" class="aria-[current=page]:font-semibold">Today</a>
    <a data-screen="streaks" class="aria-[current=page]:font-semibold">Streaks</a>
  </nav>
  <h1 class="font-display text-4xl">Kindling</h1>
  <p class="text-stone-500">12 days in a row</p>
  <div data-action="Open Read 20 pages" class="mt-4 rounded-2xl bg-white/70 p-4 shadow">
    <i data-lucide="book-open"></i> Read 20 pages <span class="text-sm text-stone-400">done at 8:10</span>
  </div>
  <button class="mt-4 rounded-full bg-accent px-4 py-2 text-white">New habit</button>
</div>
```

Clicking **New habit** or the card sends that interaction, the screen's text and any typed values to the model. Meanwhile the screen stays put and only what you clicked shows it is loading (a spinner on a button, a shimmer on a row); the screen that comes back replaces this one. Links, buttons, tabs, `data-action` elements, Enter in a field, toggles and form submits all count; controls marked `data-local` stay with the screen's own script (a play button, a flip animation).

Every click builds the app out instead of starting over. The model gets the app so far (its sections and what they show, its shared styles, its nav) and keeps the shell while it adds to it. Styles any screen defined load on every screen, the newest `data-nav` regions replace older ones everywhere, and a section that exists (`data-screen="streaks"`) opens instantly from any screen.

The pipeline: prompt → one answer (meta json + HTML) → stored as is → served as its own document in a sandboxed iframe (`sandbox="allow-scripts"`, no same-origin) that talks to the shell only via `postMessage`. **Customize…** sends the first screen with your instruction and gets the whole new screen back; every change is a version you can restore from **Version History**. Apps from the older React format reinstall themselves the first time they open.

The engineering spec is [`docs/SPEC.md`](docs/SPEC.md).

## Good to know

- **How long it takes.** Measured with Grok `grok-4.7-build-fast` on low effort (the configured `.env`): isolated servers, real runs in headless Chrome, the compact screens (a hard ~3.5 KB budget, each screen on its own) and the growing apps (quality first, shared shell) generating side by side so both saw the same Grok load (3 apps, 3 clicks each, medians):

  | | Compact screens | Growing apps (now) |
  | --- | --- | --- |
  | Open a new app from Spotlight | about 26 s (24–29 s) | about 67 s (60–90 s) |
  | Next screen after a click | about 18 s (16–25 s) | about 62 s (37–114 s) |
  | Opening a section the app already has | — | instant |
  | Answer size | about 4 KB | about 16 KB |

  Nearly all of that is the model writing its answer, so answer length is what moves the time; the richer screens cost it. While a screen is on its way the current one stays up and only the clicked control shows it is loading. A cached screen or an existing section opens instantly. A bigger model or higher effort takes longer per answer.
- **Generated code runs sandboxed** in an iframe without same-origin access and talks to the shell only through `postMessage`. Its Content-Security-Policy allows its own inline scripts and styles but no network at all: no fetch, no remote scripts, fonts or images.
- **One world per server.** Everything lives in `data/` (or `SLOPOS_DATA_DIR`). Back that folder up to keep your world, or use Reset slopOS to start over.

## Keyboard

| | |
|---|---|
| Ctrl/Cmd + Space, Ctrl/Cmd + K | Spotlight |
| Ctrl/Cmd + Shift + A | App drawer |
| Ctrl/Cmd + Shift + F | Full screen |
| Ctrl/Cmd + W / M | Close / minimize window |
| Ctrl + ` (hold) | Switch windows |
| Ctrl + Alt + ← / → / ↑ / ↓ | Snap left / right / maximize / restore |
| Ctrl + / | All shortcuts |

Ctrl always works. Cmd works wherever the browser lets the page have it, and in full screen on Chromium slopOS uses the Keyboard Lock API so Esc and Ctrl/Cmd+W reach it.

## Project layout

```
server/            HTTP server: the shell, /runtime, /api
  apps/            app registry, the screen document and its CSP
  generator/       providers (grok, codex, claude, mock), queue, prompts, world store
web/src/shell/     desktop, windows and their screen history, menu bar, dock, Spotlight, drawer
web/src/design/    design tokens and the shell's component kit
runtime/           what runs inside a screen: the interaction hook, screen.css, the optional React + htm module
data/              your world: apps, screens, settings (gitignored)
docs/              SPEC.md, demo and screenshots
```

## License

[MIT](LICENSE)
