# slopOS app SDK

This document is the whole contract for a slopOS app. Follow it exactly.
An app that ignores it will not look like it belongs here, and may not run.

## Hard rules

1. One file, `app.tsx`, plus `manifest.json` beside it. `export default function App()`.
2. Import only from `react` and `@slop/sdk`. No `react-dom`, no npm packages, no relative files, no `import()`.
3. No external CSS, fonts, images, or scripts. Style with kit components, `var(--slop-…)` tokens, or one `<style>` tag whose classes are prefixed with the app id (`notes-title`, never `.title`).
4. No `localStorage` or `sessionStorage`. Persist with `useStorage` / `storage`. The frame is a sandboxed null origin.
5. Network only through `slopFetch` (GET and POST, string bodies). Do not call `fetch`.
6. Keep the file under about 600 lines. State, helpers, and types live in that one file.
7. Do not wrap the default export in a provider. The frame already provides the SDK.
8. Fill the window. The root can be `style={{ height: '100%' }}`. `SplitView`, `Toolbar`, and `ScrollArea` are how a window is built.
9. Build the core of the app for real. Do not fake the rest with empty handlers, "coming soon", or lorem stubs. Leave secondary destinations handler-less, or give them an `intent`. See below.

## The infinite world

slopOS is a world that materializes as you use it. Searching or activating something that does not exist yet asks Grok to generate it. Three kinds, one pipeline:

| kind | What comes back | Where it shows |
| --- | --- | --- |
| `content` | JSON matching a schema you pass | Your component, via `useGenerated` or `generate` |
| `view` | A screen component `View({ params, context })` | Pushed on this window's stack, or inlined with `<GenerativeView>` |
| `app` | A new app | A new window |

`auto` (what a handler-less control uses) lets the host decide: an existing app that clearly fits is opened, a page that belongs in this app is pushed, a different job becomes a new app.

**Generative by default.** These controls, when they have no handler and are not disabled, call `openGenerative` on click:

- `Button` — intent is the `intent` prop, otherwise the visible text
- `ListItem` — intent is `intent`, otherwise `title`
- `Link` — intent is `intent`, otherwise the visible text
- `Card` — only when you pass `intent` (a card with neither `onClick` nor `intent` is a plain surface)
- `SearchField` — when `onSearch` is omitted, Enter generates a results screen for the query

They show a tiny sparkle on hover. That is the only affordance. Do not add your own "generate" icons or explanatory copy.

While a destination is materializing, the window shows the title immediately, a soft shimmer, and one live status line. A button shows a thin in-progress bar. Failures are a calm message and Try again. You do not draw that chrome yourself.

**What to implement yourself.** The thing the app is for: the list, the timer, the editor, the form, the saved data. Do that with real state and `useStorage`.

**What to leave generative.** Secondary screens, settings, detail pages, "more…", references, anything the user might open that is not the core. Write the control and stop:

```tsx
<Button>Settings</Button>
<ListItem title="Invoices" subtitle="ACME" />
<Link intent="Weather in Lisbon">Lisbon</Link>
<SearchField value={q} onChange={setQ} placeholder="Search" aria-label="Search" />
```

**Context.** Call `useGenContext` once near the root of the screen with a small JSON object: what this screen is, the names on it, the shape of the data. It is attached to every generative request, along with the app id and name and the current screen title. Same intent plus the same context comes back as the same saved page.

**Content.** When the words themselves should be generated (an article, a summary, sample rows, search hits), use `useGenerated` with `kind: 'content'` and a JSON schema. Render `status`, `data`, `progress`, and `error`. Do not invent the paragraph while pretending it was loaded.

Generated views share this app's `useStorage`. They follow the same import rules. You do not load them yourself.

## Look native

slopOS is a warm, slightly playful reading of macOS. Familiar structure, its own character. Tasteful. Never neon, glassy, or cartoonish.

Reach for a kit component before any custom style. If you write CSS, use tokens only.

**Color.** Surfaces are warm paper and stone, not pure white or blue-black. Text is `--slop-fg`, secondary `--slop-fg-muted`, placeholders `--slop-fg-subtle`. The accent is a tangerine (`--slop-accent`). Use it once per view: the primary button, the selected row, a single badge. Selection is `--slop-accent-soft` with accent text, not a saturated bar. Status colors are `--slop-danger`, `--slop-success`, `--slop-warning` and their `-soft` fills. Do not branch on light or dark yourself; tokens already change. Read `useTheme().mode` only when a drawing really needs it.

**Type.** UI is Inter at 13px (`--slop-text-md`). Scale: 11, 12, 13, 15, 20, 28 (`--slop-text-xs` through `--slop-text-2xl`). One display moment per screen may use Fraunces via `<Heading>` (level 1) or `font-family: var(--slop-font-display)` on a big number. Do not set Fraunces on body copy, toolbars, or tables. Mono is `--slop-font-mono`, for a `Kbd` or a figure, not for paragraphs.

**Space and shape.** Spacing is 4, 8, 12, 16, 20, 24, 32 (`--slop-space-1` … `--slop-space-6`, `--slop-space-8`). Pad a window with 16 or 20, gaps of 8 or 12. Controls are 32px tall, or 28px with `size="sm"`. Radius: controls 8 (`--slop-radius-md`), cards 12, windows 14. Hairlines are `--slop-border`. Shadows are the `--slop-shadow-*` tokens, and only on cards and popovers the kit already draws.

**Layouts that already feel like the system.**

- Toolbar and content. `<Toolbar title="…">` on top, `<ScrollArea style={{ flex: 1 }}>` under it, the column `style={{ height: '100%' }}`.
- Sidebar and content. `<SplitView sidebar={…}>`. Pass `resizable` when the list is the point. Put the list in a sunken sidebar; the kit already paints that.
- A centered utility. A `Stack` with `align="center"` `justify="center"` and `style={{ height: '100%' }}`, one big number, one primary button, almost nothing else.

**A small playful touch.** One is enough. A Fraunces number on a timer. An `EmptyState` (it already has a soft blob behind the icon). A friendly verb in the empty copy ("Nothing repeating yet"), not a joke and not an explanation. Do not add illustrations, gradients, bounce, or a second accent.

**Avoid.** Purple gradients, pure `#000` / `#fff`, 1px gaps, custom fonts, heavy drop shadows, full-width accent bars, icon salad, spinners as the only loading state, disabled buttons that should have been generative, and any sentence that says the feature is coming later.

## manifest.json

```json
{
  "id": "notes",
  "name": "Notes",
  "icon": "StickyNote",
  "description": "A quiet place for notes.",
  "tint": "#e8a090",
  "window": { "width": 720, "height": 480, "minWidth": 360, "minHeight": 240, "resizable": true },
  "version": 1
}
```

- `id`: lowercase letters, digits, hyphens. Must match the directory name.
- `icon`: a Lucide name in PascalCase (`StickyNote`, `Timer`, `BookOpen`). The shell draws it on a rounded tile.
- `tint`: optional CSS color for that tile. Omit it and the shell picks a stable hue from `id`.
- `window.resizable`: default true. `false` for a fixed tool.
- Leave `createdAt`, `updatedAt`, `prompt`, and `prompts` to the server.

## Tokens

Use them in inline styles: `style={{ color: 'var(--slop-fg-muted)', padding: 'var(--slop-space-4)' }}`.

| Token | Role |
| --- | --- |
| `--slop-font`, `--slop-font-mono`, `--slop-font-display` | Inter, JetBrains Mono, Fraunces |
| `--slop-text-xs` … `--slop-text-2xl` | 11, 12, 13, 15, 20, 28 px |
| `--slop-radius-sm` … `--slop-radius-xl` | 6, 8, 12, 14 px |
| `--slop-space-1` … `--slop-space-6`, `--slop-space-8` | 4, 8, 12, 16, 20, 24, 32 px |
| `--slop-bg`, `--slop-bg-elevated`, `--slop-bg-sunken` | window, card, input or sidebar |
| `--slop-fg`, `--slop-fg-muted`, `--slop-fg-subtle` | text, secondary, placeholder |
| `--slop-border` | hairline |
| `--slop-accent`, `--slop-accent-fg`, `--slop-accent-soft` | tangerine, its text, its tint |
| `--slop-danger`, `--slop-success`, `--slop-warning` and `*-soft` | status |
| `--slop-shadow-sm`, `--slop-shadow-md`, `--slop-shadow-lg` | shadows |

Do not invent variables. Light and dark are already applied.

## Window, storage, system

```tsx
const { title, setTitle, setSize, close, focused } = useWindow()
setTitle('Shopping')
setSize(640, 420) // content size in px; the shell clamps to the manifest minimum
close()
```

`focused` is true when this window is the active one.

```tsx
const [value, setValue, { loaded }] = useStorage('notes', [] as Note[])
setValue(next)
setValue((prev) => [...prev, item])
```

- `value` is `initial` until the server replies. `loaded` is false until then. Do not treat "empty" as real before `loaded`, or the first paint will flash.
- Writes are debounced and flushed when the view closes. Rapid edits do not flicker the value you typed.
- Values are JSON. Each key is one JSON value. Keys are a single path segment (no `/`).
- Minimize destroys the iframe. Only storage survives.

```tsx
await storage.get<Note[]>('notes')   // undefined if missing
await storage.set('notes', notes)
await storage.remove('notes')
await storage.keys()
```

```tsx
notify('Saved', 'Your note is on the desk.')  // shell toast; body optional
const { mode, accent } = useTheme()           // mode is 'light' | 'dark'
openApp('notes')                              // focus that app, or open a window. Unknown ids do nothing.
await clipboard.write('Hello')
await download('notes.txt', text)             // string or a small Blob
const yes = await confirm('Delete this note?') // in-window dialog, resolves false on cancel
const res = await slopFetch('https://example.com/api', { method: 'POST', body: JSON.stringify(data) })
```

`slopFetch` returns a `Response`. GET and POST only. String bodies only.

```tsx
useMenu([
  {
    label: 'File',
    items: [
      { label: 'New', shortcut: '⌘N', onSelect: create },
      'separator',
      { label: 'Delete', disabled: !current, onSelect: remove },
    ],
  },
])
```

Menus show in the shell menu bar while the window is focused. `shortcut` is a label, not a binding. Bind keys with `useHotkey`. Pass a stable structure; the SDK ignores function identity when deciding to update the bar.

```tsx
useHotkey('mod+n', create)          // mod = Cmd on macOS, Ctrl elsewhere
useHotkey('mod+shift+p', command)
useInterval(() => tick(), 1000)     // pass null to pause
const now = useNow(1000)            // a Date, refreshed on that interval
```

`useHotkey` combos are `mod`, `shift`, `alt`, plus a key (`enter`, `escape`, `space`, `left`, `n`, `[`). The handler is read from a ref, so an inline function is fine. Plain keys do not fire while typing in a field. Combos with `mod` or `alt` do.

```tsx
formatters.date(value)              // Date | number | string. Optional Intl options.
formatters.time(value)
formatters.relative(value)          // "3 minutes ago". Optional `now` in ms.
formatters.number(value)            // Optional Intl options. '' when not finite.
```

## Generative API

```tsx
type GenRequest = {
  intent: string
  kind?: 'auto' | 'app' | 'view' | 'content'   // default depends on the helper
  context?: unknown                             // JSON, merged over useGenContext
  schema?: object                               // JSON schema, content only
  key?: string                                  // cache key override
  fresh?: boolean                               // ignore the cached result
}

type GenResult<T> =
  | { kind: 'content'; data: T }
  | { kind: 'view'; viewId: string }
  | { kind: 'app'; appId: string }

const result = await generate<Article>({ intent: 'A short piece on tannins', kind: 'content', schema })

const article = useGenerated<Article>(req)     // pass null to stay idle
article.status                                  // 'idle' | 'loading' | 'ready' | 'error'
article.data
article.error
article.progress                                // one line, while loading
article.regenerate()                            // same request, fresh

useGenContext({ screen: 'Cellar', wines: names })

openGenerative({ intent: 'Invoice for ACME', context: { id } })

const screens = useScreens()
screens.stack                                   // { id, title, viewId?, intent? }[]
screens.push(viewId)                            // an already generated view
screens.push({ intent, context, title? })       // generate a view, then push it
screens.pop()

<GenerativeView intent="Pairing notes" context={{ wine }} fallback={<Text muted>Sketching…</Text>} />
```

`useGenerated` defaults `kind` to `'content'`. A view result is reported as an error there; use `<GenerativeView>` or `useScreens().push` for views.

The stack is restored when the window reloads. Back is the header chevron, Alt+Left, or Cmd/Ctrl+[`. Regenerate is the quiet ··· on the header.

A generated view is `export default function View({ params, context })`. `params` for a page opened from a control includes `{ title, intent }`.

## Components

All components accept optional `className` and `style`. `onClick` handlers take no event. Controls are 32px (`size="md"`, the default) or 28px (`size="sm"`).

### Button

`variant`: `'primary' | 'secondary' | 'ghost' | 'danger'` (default `'secondary'`). `size`: `'sm' | 'md'`. `disabled`, `type` (`'button'` default), `title`, `intent`, `children`.

No `onClick` makes it generative.

```tsx
<Button variant="primary" onClick={save}>Save</Button>
<Button>Settings</Button>
```

### IconButton

`icon` (Lucide name), `label` (accessible name, required), `variant` (default `'ghost'`), `size`, `disabled`, `onClick`. Icon buttons are never generative; they always need `onClick`.

```tsx
<IconButton icon="Plus" label="New note" onClick={create} />
```

### Input

`value`, `defaultValue`, `placeholder`, `type` (default `'text'`), `size`, `disabled`, `autoFocus`, `aria-label`, `onChange(value: string)`.

### TextArea

`value`, `defaultValue`, `placeholder`, `rows`, `disabled`, `aria-label`, `onChange(value: string)`.

### Select

`value`, `onChange(value: string)`, `options: { value, label }[]`, `size`, `disabled`, `aria-label`.

### Checkbox

`checked`, `onChange(checked: boolean)`, `label`, `aria-label`, `disabled`.

### Switch

`checked`, `onChange(checked: boolean)`, `label`, `aria-label`, `disabled`.

### Slider

`value`, `defaultValue`, `min` (0), `max` (100), `step` (1), `onChange(value: number)`, `disabled`, `aria-label`.

### SearchField

`value`, `defaultValue`, `placeholder` (`'Search'`), `size`, `disabled`, `aria-label`, `onChange(value: string)`, `onSearch(value: string)`, `intent`.

Enter submits. With `onSearch`, that function runs. Without it, a non-empty query opens a generated results screen. Pass `onSearch` for a filter you handle yourself.

### NumberInput

Also exported as `Stepper`. `value`, `defaultValue`, `min`, `max`, `step` (1), `size`, `disabled`, `aria-label`, `onChange(value: number)`. The control hugs its value: the number stays centered, and the minus and plus buttons are part of the same compact field. Do not stretch it to the width of the form.

### SegmentedControl

`value`, `onChange(value: string)`, `options: { value, label }[]`, `size`, `disabled`, `aria-label`.

### ColorSwatch

`value`, `onChange(value: string)`, `colors` (default tangerine, blue, green, plum, graphite, rose, gold, ink), `disabled`, `aria-label`.

### ProgressBar

`value` (omit for an indeterminate bar), `max` (1), `label`. The fill is `value / max`, clamped to 0–1.

### Field and Section

`Field` is `label`, `hint`, and one control. `Section` is `title`, `description`, and the block under them.

```tsx
<Section title="Reminders" description="Only what you asked to be nudged about.">
  <Field label="Name" hint="Shown in the list.">
    <Input value={name} onChange={setName} aria-label="Name" />
  </Field>
</Section>
```

### Card

`padding`, `onClick`, `intent`, `children`. Elevated surface, hairline, small shadow. `onClick` makes it a button. `intent` without `onClick` makes it generative. Neither keeps it a static `div`.

### List and ListItem

```tsx
<List aria-label="Notes">
  <ListItem
    icon="StickyNote"
    title="Milk"
    subtitle="Today"
    trailing={<Badge>2</Badge>}
    selected={id === current}
    onClick={() => setCurrent(id)}
  />
</List>
```

`ListItem` requires `title`. Optional: `icon`, `subtitle`, `trailing`, `selected`, `disabled`, `intent`, `onClick`. No `onClick` makes the row generative.

### Link

`onClick`, `intent`, `disabled`, `children`. A text button in the accent color. No `onClick` makes it generative.

### Tabs

```tsx
<Tabs
  aria-label="Sections"
  tabs={[{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }]}
  value={tab}
  onChange={setTab}
/>
```

The bar only. Render the panel yourself.

### Toolbar

`title`, `leading`, `trailing`, `children`. A 44px strip with a bottom hairline. Children sit in the flexible middle.

### SplitView

```tsx
<SplitView sidebarWidth={220} resizable sidebar={<Stack />}>
  <Editor />
</SplitView>
```

`sidebarWidth` (220), `resizable`, `minSidebar` (160), `maxSidebar` (420), `onSidebarWidthChange(width)`. Sidebar is sunken. The view is `height: 100%`.

### Stack, Row, Grid

`Stack` is a column. `Row` is a row, `align` default `'center'`. Both take `gap` (8), `align`, `justify` (`'start' | 'center' | 'end' | 'space-between'`), `grow` (`true` or a number), `padding` (number is px). `Row` also takes `wrap`.

`Grid` takes `columns`, `gap` (12), `minChildWidth` (px number or CSS size; switches to `auto-fit`), `align`, `justify`.

### Heading

`level` 1 | 2 | 3. Level 1 is Fraunces at 20px. Level 2 is 15px. Level 3 is 13px. All semibold, margin 0.

### Text

`muted`, `size` `'xs' | 'sm' | 'md' | 'lg'`. Margin 0.

### Badge, Tag, Chip

`Badge` `tone`: `'neutral' | 'accent' | 'danger' | 'success' | 'warning'`.

`Tag` uses the same `tone`, plus `onRemove` for a small dismiss button.

`Chip` is a 32px pill (`size="sm"` is 28). `selected`, `onClick`, `disabled`.

### Avatar

`name` (required, used for initials and a soft tint), `src`, `size` (28).

### Table

```tsx
<Table
  aria-label="Habits"
  rows={habits}
  rowKey={(row) => row.id}
  columns={[
    { key: 'name', header: 'Name', sortable: true },
    { key: 'streak', header: 'Streak', sortable: true, align: 'end', render: (row) => row.streak },
  ]}
/>
```

`Column`: `key`, `header`, `sortable`, `align` `'start' | 'end'`, `width`, `render(row)`. Without `onSort`, sortable headers sort the rows in place. With `onSort(key, dir)`, you own the order and may pass `sort={{ key, dir }}`. `empty` is the message when there are no rows.

### Tooltip, Menu, Dialog, Sheet

```tsx
<Tooltip label="Save"><IconButton icon="Check" label="Save" onClick={save} /></Tooltip>

<Menu
  align="end"
  trigger={<Button size="sm">More</Button>}
  items={[
    { label: 'Rename', onSelect: rename },
    'separator',
    { label: 'Delete', danger: true, disabled: !current, onSelect: remove },
  ]}
/>

<Dialog open={open} title="Delete note" onClose={() => setOpen(false)}>
  <Text>This removes the note from this desk.</Text>
  <Row justify="end">
    <Button onClick={() => setOpen(false)}>Cancel</Button>
    <Button variant="danger" onClick={remove}>Delete</Button>
  </Row>
</Dialog>

<Sheet open={open} title="Details" side="end" onClose={() => setOpen(false)}>
  <Text muted>A side thought, still inside the window.</Text>
</Sheet>
```

`Menu` is also exported as `DropdownMenu`. `align` is `'start'` (default) or `'end'`. An item is `{ label, shortcut?, disabled?, danger?, onSelect }` or `'separator'`.

`Dialog` `width` defaults to 400. `Sheet` `side` is `'end'` (default) or `'bottom'`. These float inside the app window.

Opening a dialog or sheet focuses the first text field. With no field, focus lands on the last `variant="primary"` button. Tab stays inside. Enter activates that primary button (a textarea keeps the newline). Escape and the backdrop call `onClose`. A menu focuses its first item, moves with the arrow keys, and closes on Escape. Tooltips do not take focus. Focus rings sit on controls only — never on the dialog, the sheet, or the menu panel. `confirm(message)` uses this same dialog: Enter confirms, Escape cancels.

### Divider

`orientation`: `'horizontal'` (default) or `'vertical'`.

### EmptyState

`icon`, `title` (required), `body`, `children` (usually a button).

### Spinner

`size` in px (default 16). Has an accessible "Loading" label. Prefer a skeleton or a `ProgressBar` when a whole screen is appearing. The frame already does that for generated screens.

### Kbd

`<Kbd>⌘K</Kbd>`

### ScrollArea

`overflow: auto` and a thin scrollbar. Give it `style={{ flex: 1 }}` inside a `Stack` that has a height.

### Icon

`<Icon name="Calendar" size={16} />`. `strokeWidth` optional (default 1.75). Unknown names render an empty box.

## Example: tea timer

A centered utility. One number in Fraunces, one accent button.

```tsx
import { useState } from 'react'
import { Button, Heading, ProgressBar, Row, Stack, Text, useInterval } from '@slop/sdk'

export default function App() {
  const total = 4 * 60
  const [left, setLeft] = useState(total)
  const [running, setRunning] = useState(false)

  useInterval(() => setLeft((value) => (value <= 1 ? 0 : value - 1)), running ? 1000 : null)

  const minutes = String(Math.floor(left / 60)).padStart(2, '0')
  const seconds = String(left % 60).padStart(2, '0')

  return (
    <Stack gap={16} align="center" justify="center" style={{ height: '100%', padding: 28 }}>
      <style>{`.tea-time { margin: 0; font-family: var(--slop-font-display); font-size: 64px; font-weight: 520; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }`}</style>
      <Stack gap={4} align="center">
        <Heading>Tea</Heading>
        <Text muted size="sm">Four quiet minutes.</Text>
      </Stack>
      <p className="tea-time">{minutes}:{seconds}</p>
      <div style={{ width: 200 }}>
        <ProgressBar value={(total - left) / total} label="Steep" />
      </div>
      <Row>
        <Button variant="primary" onClick={() => (left === 0 ? setLeft(total) : setRunning((value) => !value))}>
          {left === 0 ? 'Again' : running ? 'Pause' : 'Start'}
        </Button>
        <Button variant="ghost" onClick={() => { setRunning(false); setLeft(total) }}>Reset</Button>
      </Row>
    </Stack>
  )
}
```

## Example: checklist

The core is real and stored. Empty state, field, no flash before `loaded`.

```tsx
import { useState } from 'react'
import { Button, Checkbox, EmptyState, Field, Heading, Input, Row, Stack, useStorage } from '@slop/sdk'

type Item = { id: string; label: string; done: boolean }

export default function App() {
  const [items, setItems, { loaded }] = useStorage<Item[]>('items', [])
  const [draft, setDraft] = useState('')

  function add() {
    const label = draft.trim()
    if (!label) return
    setItems((prev) => [{ id: crypto.randomUUID(), label, done: false }, ...prev])
    setDraft('')
  }

  return (
    <Stack gap={16} style={{ height: '100%', padding: 20 }}>
      <Heading>Checklist</Heading>
      <Field label="Add">
        <Row>
          <Input value={draft} onChange={setDraft} placeholder="Milk" aria-label="New item" />
          <Button variant="primary" onClick={add}>Add</Button>
        </Row>
      </Field>
      {!loaded ? null : items.length === 0 ? (
        <EmptyState icon="Check" title="Nothing yet" body="Add the first thing above." />
      ) : (
        <Stack gap={6}>
          {items.map((item) => (
            <Checkbox
              key={item.id}
              checked={item.done}
              label={item.label}
              onChange={(done) => setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, done } : row)))}
            />
          ))}
        </Stack>
      )}
    </Stack>
  )
}
```

## Example: field guide

The shelf is real. The welcome copy and the trail link are generated. `useGenContext` tells the world what is already on screen.

```tsx
import { Card, Heading, Link, List, ListItem, Stack, Text, useGenContext, useGenerated } from '@slop/sdk'

const TRAILS = ['Warm paper', 'Tangerine', 'A quiet timer']

export default function App() {
  useGenContext({ screen: 'Shelf', trails: TRAILS })
  const lede = useGenerated<{ title: string; summary: string }>({
    intent: 'A two-sentence welcome to a walking field guide',
    kind: 'content',
    schema: {
      type: 'object',
      properties: { title: { type: 'string' }, summary: { type: 'string' } },
      required: ['title', 'summary'],
    },
  })

  return (
    <Stack gap={14} style={{ height: '100%', padding: 20 }}>
      <Heading>{lede.data?.title || 'Field guide'}</Heading>
      <Text muted>
        {lede.status === 'loading' ? lede.progress || 'Writing…' : lede.status === 'error' ? lede.error : lede.data?.summary}
      </Text>
      <Card>
        <List aria-label="Trails">
          {TRAILS.map((trail) => (
            <ListItem key={trail} icon="Footprints" title={trail} subtitle="Open" />
          ))}
        </List>
      </Card>
      <Link intent="What to pack for a short walk">What to pack</Link>
    </Stack>
  )
}
```

## Do not

- Do not import anything except `react` and `@slop/sdk`.
- Do not call `fetch`, touch `localStorage`, or load a remote font or stylesheet.
- Do not invent CSS variables. Only `--slop-*` tokens exist.
- Do not leave a dead button. Give it a real `onClick`, or no handler so the world can open what is behind it.
- Do not stub a screen with "Coming soon".
- Do not depend on the window staying mounted. Minimize destroys the iframe; storage and the screen stack survive.
