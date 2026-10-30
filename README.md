# slopOS

**A desktop in your browser where every app is written on the spot.**

slopOS is a calm, slightly playful take on a macOS-style desktop: menu bar, dock, windows with traffic lights, Spotlight, an app drawer. It ships with **no apps at all**. Open any app by name and a model (Grok by default, or Codex or Claude) draws its first screen as a single React file. Everything you click, type or toggle in it asks for the next screen. Each screen compiles, runs sandboxed in the window, and stays on your desk.

![slopOS demo: entering slopOS, asking Spotlight for an app, and clicking a button whose screen is generated on the fly](docs/demo.gif)

<sub>A real session with Grok (grok-4.7, medium effort). The waits are fast-forwarded: the app took about 2½ minutes and the generated Settings screen about a minute. Also available as <a href="docs/demo.mp4">MP4</a>.</sub>

## The idea: an infinite, procedurally generated world

Nothing is planned ahead. An app is only the screen you are looking at:

- **Opening an app** generates one polished first screen: no navigation architecture, no other screens.
- **Every interaction** on that screen (a button, a link, a list row, a tab, Enter in a field, a toggle, a form submit) is caught by the runtime. The screen, what it showed, what was typed and what was clicked go to the model, which answers with the next screen. It replaces the current one in the same window, with back and forward.
- **Spotlight and the drawer** list your apps and a few ordinary ones. Typing a name that doesn't exist opens it like any other app.

It stays **coherent**. A world store remembers every app, the people, places and things that were invented, and the screens seen so far. Every generation gets a compact digest of it, and each screen carries over what the previous one showed. Results are cached: the same click on the same screen leads to the same screen.

It **persists**. Apps, screens, app data, open windows and each window's back/forward history survive reloads and restarts. **Reset slopOS** in the logo menu wipes the world and returns to the pristine first start.

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
npm run check:fixtures # compiles the hidden test apps and the SDK doc examples
```

## Generator providers

`SLOPOS_GENERATOR` in `.env` selects one of `grok`, `codex`, `claude` or `mock`. Each provider has exactly one code path and there are no silent fallbacks: if it fails, the UI says so.

- **grok** runs a long-lived `grok agent stdio` process and speaks the [Agent Client Protocol](https://agentclientprotocol.com) to it (`@agentclientprotocol/sdk`). Model and reasoning effort are set per session. The client offers no file system and refuses every tool.
- **codex** runs `codex exec --json` with a read-only sandbox.
- **claude** uses the Claude Agent SDK with no tools and no user settings, skills or MCP servers loaded.
- **mock** produces canned answers for tests and screenshots.

Every generation is **single-shot**: one answer per attempt, with the screen's metadata as JSON and the whole source as a `tsx` block. The model never reads or writes files; the server writes them. Model and effort are configurable per provider and per kind of generation (`SLOPOS_GROK_MODEL`, `SLOPOS_GROK_EFFORT`, `SLOPOS_GROK_MODEL_VIEW`, …), and up to `SLOPOS_CONCURRENCY` jobs (default 4) run at once. See [`.env.example`](.env.example) for everything, including timeouts.

## How generated apps work

An app is a folder with a `manifest.json` (name, lucide icon, window size), **one `app.tsx`** for its first screen, and one `views/<id>/view.tsx` per later screen. A screen is static: kit components, design tokens, realistic content, no handlers or state. It may only import from `react` and `@slop/sdk`:

```tsx
import { Button, List, ListItem, Stack, Stat, Toolbar } from '@slop/sdk'

export default function App() {
  return (
    <Stack fill gap={0}>
      <Toolbar title="Habits" trailing={<Button variant="primary">New habit</Button>} />
      <Stack padding={20} gap={12}>
        <Stat value={12} label="days in a row" />
        <List aria-label="Today">
          <ListItem icon="BookOpen" title="Read 20 pages" subtitle="Done at 8:10" />
          <ListItem icon="Footprints" title="Walk 5,000 steps" subtitle="3,200 so far" />
        </List>
      </Stack>
    </Stack>
  )
}
```

Clicking **New habit** or a row sends that interaction, the screen's text and any typed values to the model, and the screen that comes back replaces this one.

The pipeline: prompt → one answer (meta json + source) → the server checks the imports and compiles with esbuild → on a compile error the same session gets only the errors back (up to three attempts) → the screen runs in a sandboxed iframe (`sandbox="allow-scripts"`, no same-origin) and talks to the shell only via `postMessage`. **Customize…** sends the first screen with your instruction and gets the whole new screen back; every change is a version you can restore from **Version History**.

The engineering spec is [`docs/SPEC.md`](docs/SPEC.md). [`docs/APP_SDK.md`](docs/APP_SDK.md) documents the full SDK for hand-written apps.

## Good to know

- **How long it takes.** Measured with Grok `grok-4.7-build-fast` on low effort (the configured `.env`), isolated server, real runs:

  | | Before (whole app, agent loop) | Now (one screen, single-shot) |
  | --- | --- | --- |
  | Open a new app from Spotlight | about 46 s (42–50 s) | about 29 s (25–32 s) |
  | Next screen after a click | about 24 s (18–34 s) | about 19 s (14–25 s) |
  | First compile failed | 0 of 10 | 0 of 12 |

  A cached screen opens instantly. A bigger model or higher effort takes longer per answer.
- **Generated code runs sandboxed** in an iframe without same-origin access and talks to the shell only through `postMessage`. A Content-Security-Policy keeps them on slopOS itself: network access goes through the server's `slopFetch` proxy.
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
  apps/            app registry, esbuild compile, per-app storage
  generator/       providers (grok, codex, claude, mock), queue, prompts, world store
web/src/shell/     desktop, windows, menu bar, dock, Spotlight, drawer, generation UI
web/src/design/    design tokens and the component kit
runtime/           the sandboxed iframe runtime and @slop/sdk
fixtures/apps/     hidden test apps (only with SLOPOS_FIXTURES=1)
data/              your world: apps, screens, storage, settings (gitignored)
docs/              APP_SDK.md, SPEC.md, demo and screenshots
```

## License

[MIT](LICENSE)
