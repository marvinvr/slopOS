import fs from 'node:fs/promises'
import path from 'node:path'
import { mockMs } from '../config'
import type { Availability, GenEvent, GeneratorProvider, RunOptions } from '../types'
import { sleep } from './util'

const manifest = (name: string, icon: string, description: string) => ({
  name,
  icon,
  description,
  window: { width: 440, height: 360, minWidth: 360, minHeight: 280, resizable: true },
})

function pomodoro(mark: string): string {
  return `import { Button, Heading, Row, Stack, Text, useInterval, useStorage } from '@slop/sdk'

// slop-mark ${mark}
export default function App() {
  const [left, setLeft] = useStorage('left', 25 * 60)
  const [running, setRunning] = useStorage('running', false)
  useInterval(() => {
    if (!running) return
    setLeft((value) => (value > 0 ? value - 1 : 0))
  }, 1000)
  const minutes = String(Math.floor(left / 60)).padStart(2, '0')
  const seconds = String(left % 60).padStart(2, '0')
  return (
    <Stack gap={12} style={{ height: '100%', padding: 20 }}>
      <Heading>Pomodoro</Heading>
      <Text>{minutes}:{seconds}</Text>
      <Row gap={8}>
        <Button variant="primary" onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Start'}</Button>
        <Button variant="ghost" onClick={() => { setRunning(false); setLeft(25 * 60) }}>Reset</Button>
      </Row>
    </Stack>
  )
}
`
}

function todo(mark: string): string {
  return `import { useState } from 'react'
import { Button, EmptyState, Heading, Input, List, ListItem, Stack, useStorage } from '@slop/sdk'

// slop-mark ${mark}
export default function App() {
  const [items, setItems] = useStorage<string[]>('items', [])
  const [draft, setDraft] = useState('')
  return (
    <Stack gap={12} style={{ height: '100%', padding: 20 }}>
      <Heading>To-dos</Heading>
      <Input value={draft} placeholder="Add a task" aria-label="New task" onChange={setDraft} />
      {items.length === 0 ? (
        <EmptyState title="Nothing yet" body="Add a task to start." />
      ) : (
        <List>
          {items.map((item, index) => (
            <ListItem key={index} title={item} />
          ))}
        </List>
      )}
      <Button variant="ghost" onClick={() => { const text = draft.trim(); if (!text) return; setItems((prev) => [...prev, text]); setDraft('') }}>Add</Button>
    </Stack>
  )
}
`
}

const BROKEN = `import { Button } from '@slop/sdk'
export default function App( {
  return <Button variant="primary">Broken</Button>
}
`

const VIEW = `import { Heading, Stack, Text } from '@slop/sdk'

export default function View({ params, context }: { params?: Record<string, unknown>; context?: unknown }) {
  void params
  void context
  return (
    <Stack gap={12} style={{ height: '100%', padding: 20 }}>
      <Heading>Screen</Heading>
      <Text muted>A generated screen.</Text>
    </Stack>
  )
}
`

function wantsBroken(prompt: string): boolean {
  if (/compile attempt|failed to compile|previous file failed/i.test(prompt)) return false
  return /\bbroken\b/i.test(prompt)
}

function fillSchema(schema: Record<string, unknown> | undefined): unknown {
  if (!schema) return { ok: true }
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]
  if (schema.type === 'string') return 'sample'
  if (schema.type === 'integer' || schema.type === 'number') return 1
  if (schema.type === 'boolean') return true
  if (schema.type === 'array') return []
  const properties = schema.properties
  if (!properties || typeof properties !== 'object') return { ok: true }
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : [])
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(properties as Record<string, unknown>)) {
    if (required.size && !required.has(key)) continue
    out[key] = fillSchema((child && typeof child === 'object' ? child : {}) as Record<string, unknown>)
  }
  return out
}

function routeJson(prompt: string): unknown {
  const calling = prompt.match(/Calling app:\s*(\S+)/)?.[1]
  if (calling && calling !== 'none' && /\b(screen|settings|view)\b/i.test(prompt)) {
    return { route: 'view', appId: calling }
  }
  return { route: 'app' }
}

async function writeApp(cwd: string, prompt: string): Promise<void> {
  const edited = /Kind:\s*edit/i.test(prompt)
  const mark = edited ? 'v2' : 'v1'
  const timer = /pomodoro|\btimer\b/i.test(prompt)
  const source = wantsBroken(prompt) ? BROKEN : timer ? pomodoro(mark) : todo(mark)
  const meta = timer
    ? manifest('Pomodoro', 'Timer', 'A calm timer for one focused stretch.')
    : manifest('To-dos', 'ListTodo', 'A short list of what is left to do.')
  const world = {
    summary: { purpose: meta.description, dataShapes: timer ? ['left', 'running'] : ['items'] },
    entities: [],
  }
  await fs.mkdir(cwd, { recursive: true })
  await fs.writeFile(path.join(cwd, 'App.tsx'), source)
  await fs.writeFile(path.join(cwd, 'manifest.json'), JSON.stringify(meta, null, 2))
  await fs.writeFile(path.join(cwd, 'world.json'), JSON.stringify(world, null, 2))
}

async function writeView(cwd: string): Promise<void> {
  await fs.mkdir(cwd, { recursive: true })
  await fs.writeFile(path.join(cwd, 'View.tsx'), VIEW)
  await fs.writeFile(
    path.join(cwd, 'world.json'),
    JSON.stringify({ summary: { purpose: 'A generated screen.', dataShapes: [] }, entities: [] }, null, 2),
  )
}

export const mockProvider: GeneratorProvider = {
  id: 'mock',
  availability(): Promise<Availability> {
    return Promise.resolve({ available: true, loggedIn: true, model: 'mock', effort: 'mock' })
  },
  async *run(opts: RunOptions): AsyncIterable<GenEvent> {
    const step = Math.max(0, Math.round(mockMs() / 4))
    const sessionId = `mock:${opts.sessionKey || 'session'}`
    await sleep(step, opts.signal)
    if (opts.signal.aborted) return
    yield { type: 'thinking', text: 'Sketching a calm layout that fits the desktop.' }
    await sleep(step, opts.signal)
    if (opts.signal.aborted) return

    if (opts.kind === 'content') {
      const bad = /force-bad-json/i.test(opts.prompt) && !/previous JSON was invalid/i.test(opts.prompt)
      const output = bad ? 'not-json' : JSON.stringify(fillSchema(opts.jsonSchema))
      yield { type: 'text', text: output }
      yield { type: 'end', sessionId, output }
      return
    }
    if (opts.kind === 'route') {
      const output = JSON.stringify(routeJson(opts.prompt))
      yield { type: 'text', text: output }
      yield { type: 'end', sessionId, output }
      return
    }
    if (opts.kind === 'view') {
      await writeView(opts.cwd)
      yield { type: 'tool', text: 'write View.tsx' }
      await sleep(step, opts.signal)
      if (opts.signal.aborted) return
      yield { type: 'text', text: 'Wrote View.tsx.' }
      yield { type: 'end', sessionId, output: 'Wrote View.tsx.' }
      return
    }
    await writeApp(opts.cwd, opts.prompt)
    yield { type: 'tool', text: 'write App.tsx' }
    await sleep(step, opts.signal)
    if (opts.signal.aborted) return
    yield { type: 'text', text: 'Wrote App.tsx and manifest.json.' }
    yield { type: 'end', sessionId, output: 'Wrote App.tsx and manifest.json.' }
  },
}
