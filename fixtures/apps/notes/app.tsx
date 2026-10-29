import { useEffect, useMemo, useState } from 'react'
import {
  EmptyState,
  Input,
  List,
  ListItem,
  ScrollArea,
  SplitView,
  Stack,
  TextArea,
  useHotkey,
  useMenu,
  useStorage,
  useWindow,
} from '@slop/sdk'

type Note = { id: string; title: string; body: string; updatedAt: number }
type Doc = { notes: Note[] }

export default function App() {
  const { setTitle } = useWindow()
  const [doc, setDoc, { loaded }] = useStorage<Doc | null>('doc', null)
  const [selectedId, setSelectedId] = useStorage('selected', '')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!loaded || doc !== null) return
    const now = Date.now()
    setDoc({
      notes: [
        {
          id: crypto.randomUUID(),
          title: 'Welcome to Notes',
          body: 'This note is stored with the app, on the slopOS server.\n\nJot something down. It will still be here after a reload.',
          updatedAt: now,
        },
        {
          id: crypto.randomUUID(),
          title: 'A second thought',
          body: 'Notes is one file of React. It only talks to the shell through @slop/sdk.',
          updatedAt: now - 1000,
        },
      ],
    })
  }, [loaded, doc, setDoc])

  const notes = doc?.notes ?? []
  const selected = notes.find((note) => note.id === selectedId) ?? null

  useEffect(() => {
    setTitle(selected?.title?.trim() || 'Notes')
  }, [selected?.title, setTitle])

  useEffect(() => {
    if (!loaded || !doc?.notes.length) return
    if (doc.notes.some((note) => note.id === selectedId)) return
    setSelectedId(doc.notes[0].id)
  }, [loaded, doc, selectedId, setSelectedId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? notes.filter((note) => `${note.title}\n${note.body}`.toLowerCase().includes(q)) : notes
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [notes, query])

  function createNote() {
    const note: Note = { id: crypto.randomUUID(), title: '', body: '', updatedAt: Date.now() }
    setDoc({ notes: [note, ...notes] })
    setSelectedId(note.id)
    setQuery('')
  }

  function deleteNote() {
    if (!selected) return
    const next = notes.filter((note) => note.id !== selected.id)
    setDoc({ notes: next })
    setSelectedId(next[0]?.id ?? '')
  }

  function patch(partial: Partial<Note>) {
    if (!selected || !doc) return
    setDoc({
      notes: doc.notes.map((note) => (note.id === selected.id ? { ...note, ...partial, updatedAt: Date.now() } : note)),
    })
  }

  useHotkey('mod+n', createNote)
  useMenu([
    {
      label: 'Note',
      items: [
        { label: 'New Note', shortcut: '⌘N', onSelect: createNote },
        { label: 'Delete', disabled: !selected, onSelect: deleteNote },
      ],
    },
  ])

  return (
    <div style={{ height: '100%' }}>
      <style>{`
        .notes-title { border: 0 !important; background: transparent !important; font-size: 22px !important; font-weight: 600 !important; letter-spacing: -0.02em; height: 36px !important; padding: 0 !important; }
        .notes-body { border: 0 !important; background: transparent !important; resize: none !important; flex: 1; min-height: 0; padding: 0 !important; line-height: 1.5; }
      `}</style>
      <SplitView
        sidebarWidth={232}
        sidebar={
          <Stack gap={8} style={{ height: '100%', padding: 10 }}>
            <Input value={query} onChange={setQuery} placeholder="Search" aria-label="Search notes" />
            <ScrollArea style={{ flex: 1 }}>
              {filtered.length === 0 ? (
                <EmptyState icon="Search" title={query ? 'No matches' : 'No notes'} body={query ? 'Try a different word.' : 'Create one from the Note menu.'} />
              ) : (
                <List aria-label="Notes">
                  {filtered.map((note) => (
                    <ListItem
                      key={note.id}
                      title={note.title.trim() || 'New note'}
                      subtitle={preview(note.body) || 'Empty'}
                      trailing={<span style={{ color: 'var(--slop-fg-subtle)', fontSize: 11 }}>{ago(note.updatedAt)}</span>}
                      selected={note.id === selectedId}
                      onClick={() => setSelectedId(note.id)}
                    />
                  ))}
                </List>
              )}
            </ScrollArea>
          </Stack>
        }
      >
        {selected ? (
          <Stack gap={8} style={{ height: '100%', padding: '18px 22px 16px' }}>
            <Input className="notes-title" value={selected.title} onChange={(title) => patch({ title })} placeholder="Title" aria-label="Title" />
            <TextArea className="notes-body" value={selected.body} onChange={(body) => patch({ body })} placeholder="Start writing…" aria-label="Note body" />
          </Stack>
        ) : (
          <EmptyState icon="StickyNote" title="No note open" body="Choose one from the list, or create a new note." />
        )}
      </SplitView>
    </div>
  )
}

function preview(body: string): string {
  return body.replace(/\s+/g, ' ').trim()
}

function ago(ts: number): string {
  const seconds = Math.max(0, (Date.now() - ts) / 1000)
  if (seconds < 60) return 'Now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
