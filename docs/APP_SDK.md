# slopOS app SDK

This document is the contract for every slopOS app. A generator should follow it exactly.
The same text is the reference for apps written by hand.

## Rules

- An app is **one file**, `app.tsx`, plus a `manifest.json` beside it.
- The file must `export default function App()`.
- Imports are allowed only from `react` and `@slop/sdk`. Nothing else. No `react-dom`, no npm packages, no relative files, no CSS files, no `import()`.
- Do not load remote fonts, images, or stylesheets. Use the kit, `var(--slop-…)` tokens, and if you must, one `<style>` tag whose class names are prefixed with the app id (`notes-title`, never `.title`).
- Keep the app self-contained. State, helpers, and types live in the same file.
- Persist data with `useStorage` / `storage`. Do not use `localStorage` (the frame cannot see the host origin).
- Reach the network only through `slopFetch` (GET and POST, string bodies).
- Use the component kit so the app looks native. Prefer tokens over raw colors.
- The frame is sandboxed. There is no `window.parent` access except the SDK, which uses `postMessage` for you.
- Fill the window: the root can be `style={{ height: '100%' }}`. `SplitView` is already full height.

## manifest.json

```json
{
  "id": "notes",
  "name": "Notes",
  "icon": "StickyNote",
  "description": "A quiet place for notes.",
  "tint": "#e8a090",
  "window": { "width": 720, "height": 480, "minWidth": 360, "minHeight": 240, "resizable": true },
  "version": 1,
  "prompt": "original prompt, generated apps only"
}
```

- `id`: lowercase letters, digits, hyphens. Must match the directory name.
- `icon`: a Lucide icon name in PascalCase (`StickyNote`, `Timer`, `Calculator`). The shell draws it on a rounded tile.
- `tint`: optional CSS color. If omitted, the shell picks a stable hue from `id`.
- `window.resizable`: default true. Set false for a fixed tool.
- Generated apps may also carry `createdAt`, `updatedAt`, and `prompts` (history). Leave those to the server.

## Tokens

Colors and sizes are CSS variables. Use them in inline styles: `style={{ color: 'var(--slop-fg-muted)', padding: 'var(--slop-space-4)' }}`.

| Token | Role |
| --- | --- |
| `--slop-font`, `--slop-font-mono` | Inter, JetBrains Mono |
| `--slop-text-xs` … `--slop-text-2xl` | 11, 12, 13, 15, 20, 28 px |
| `--slop-font-display` | Fraunces, for large headings |
| `--slop-radius-sm` … `--slop-radius-xl` | 6, 8, 12, 14 px |
| `--slop-space-1` … `--slop-space-6`, `--slop-space-8` | 4, 8, 12, 16, 20, 24, 32 px |
| `--slop-bg`, `--slop-bg-elevated`, `--slop-bg-sunken` | window, card, input/sidebar |
| `--slop-fg`, `--slop-fg-muted`, `--slop-fg-subtle` | text |
| `--slop-border` | hairline |
| `--slop-accent`, `--slop-accent-fg`, `--slop-accent-soft` | accent |
| `--slop-danger`, `--slop-success`, `--slop-warning` and `*-soft` | status |
| `--slop-shadow-sm`, `--slop-shadow-md`, `--slop-shadow-lg` | shadows |

Light and dark are already applied. Do not branch on colors yourself unless you read `useTheme().mode`.

## Hooks and functions

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

- `value` is `initial` until the server replies. Check `loaded` before treating "empty" as real.
- Values are JSON. Each key is one JSON value in `data/storage/<appId>.json`.
- Keys are a single path segment (no `/`).

```tsx
await storage.get<Note[]>('notes')   // undefined if missing
await storage.set('notes', notes)
await storage.remove('notes')
await storage.keys()
```

```tsx
notify('Saved', 'Your note is on the desk.')  // shell toast; body optional
const { mode, accent } = useTheme()           // mode is 'light' | 'dark'
const res = await slopFetch('https://example.com/api', { method: 'POST', body: JSON.stringify(data) })
```

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
```

`useHotkey` combos are `mod`, `shift`, `alt`, plus a key (`enter`, `escape`, `space`, `n`). The handler is read from a ref, so an inline function is fine.

## Components

All components accept optional `className` and `style`. Controls are 32px tall (`size="md"`) or 28px (`size="sm"`). `onClick` handlers take no event.

### Button

`variant`: `'primary' | 'secondary' | 'ghost' | 'danger'` (default `secondary`). `size`: `'sm' | 'md'`. `disabled`, `type` (`'button'` default), `title`, `children`.

```tsx
<Button variant="primary" onClick={save}>Save</Button>
```

### IconButton

`icon` (Lucide name), `label` (accessible name, required), `variant`, `size`, `disabled`, `onClick`.

```tsx
<IconButton icon="Plus" label="New note" onClick={create} />
```

### Input

`value`, `defaultValue`, `placeholder`, `type`, `disabled`, `autoFocus`, `aria-label`, `onChange(value: string)`.

```tsx
<Input value={q} onChange={setQ} placeholder="Search" aria-label="Search" />
```

### TextArea

`value`, `defaultValue`, `placeholder`, `rows`, `disabled`, `aria-label`, `onChange(value: string)`.

### Select

`value`, `onChange(value: string)`, `options: { value, label }[]`, `disabled`, `aria-label`.

### Checkbox

`checked`, `onChange(checked: boolean)`, `label`, `disabled`.

### Switch

`checked`, `onChange(checked: boolean)`, `label`, `aria-label`, `disabled`.

### Slider

`value`, `defaultValue`, `min` (0), `max` (100), `step` (1), `onChange(value: number)`, `disabled`, `aria-label`.

### Card

`padding`, `onClick`, `children`. Elevated surface with a hairline and small shadow.

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

`ListItem` requires `title`. `icon`, `subtitle`, `trailing`, `selected`, `onClick` are optional.

### Tabs

```tsx
<Tabs
  aria-label="Sections"
  tabs={[{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }]}
  value={tab}
  onChange={setTab}
/>
```

Tabs are the bar only. Render the panel yourself underneath.

### Toolbar

A horizontal strip with a bottom border. Put buttons and inputs in it.

### SplitView

```tsx
<SplitView sidebarWidth={220} sidebar={<Stack />}>
  <Editor />
</SplitView>
```

Sidebar is sunken, with a hairline. The view is `height: 100%`.

### Stack and Row

`gap` is pixels (default 8). Stack is a column. Row is a row, `align` default `'center'`, optional `justify` (`'start' | 'center' | 'end' | 'space-between'`).

### Heading

`level` 1 | 2 | 3. 20px / 15px / 13px, semibold.

### Text

`muted`, `size` `'xs' | 'sm' | 'md' | 'lg'`. Margin is 0.

### Badge

`tone`: `'neutral' | 'accent' | 'danger' | 'success' | 'warning'`.

### Divider

`orientation`: `'horizontal'` (default) or `'vertical'`.

### EmptyState

`icon`, `title` (required), `body`, `children` (usually a button).

### Spinner

`size` in px (default 16). Has an accessible "Loading" label.

### Kbd

`<Kbd>⌘K</Kbd>` — a keyboard cap.

### ScrollArea

`overflow: auto` and a thin scrollbar. Give it `style={{ flex: 1 }}` inside a `Stack` that has a height.

### Icon

`<Icon name="Calendar" size={16} />`. `strokeWidth` optional (default 1.75). Unknown names render an empty box.

## Example: counter

```tsx
import { useState } from 'react'
import { Button, Heading, Row, Stack, Text } from '@slop/sdk'

export default function App() {
  const [n, setN] = useState(0)
  return (
    <Stack gap={12} style={{ padding: 20 }}>
      <Heading>Counter</Heading>
      <Text muted>A number that stays until you close the window.</Text>
      <Row>
        <Button variant="secondary" onClick={() => setN((v) => v - 1)}>-</Button>
        <Text>{n}</Text>
        <Button variant="primary" onClick={() => setN((v) => v + 1)}>+</Button>
      </Row>
    </Stack>
  )
}
```

The counter's `setN` in that snippet passes a function to React's `useState`, which is correct. `useStorage`'s setter accepts the same shape.

## Example: checklist

```tsx
import { useState } from 'react'
import { Button, Checkbox, EmptyState, Heading, Input, Row, Stack, useStorage } from '@slop/sdk'

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
    <Stack gap={12} style={{ height: '100%', padding: 16 }}>
      <Heading>Checklist</Heading>
      <Row>
        <Input value={draft} onChange={setDraft} placeholder="Add an item" aria-label="New item" />
        <Button variant="primary" onClick={add}>Add</Button>
      </Row>
      {!loaded ? null : items.length === 0 ? (
        <EmptyState icon="Check" title="Nothing yet" body="Add the first item above." />
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

## Do not

- Do not import anything except `react` and `@slop/sdk`.
- Do not wrap the default export in a provider. The frame already provides the SDK context.
- Do not call `fetch` for data you want reliably. Use `slopFetch`.
- Do not invent CSS variables. Only `--slop-*` tokens exist.
- Do not depend on the window staying mounted. Minimize destroys the iframe; only storage survives.
