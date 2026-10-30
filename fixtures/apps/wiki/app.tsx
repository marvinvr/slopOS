import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Heading,
  Link,
  List,
  ListItem,
  ScrollArea,
  SearchField,
  Stack,
  Text,
  Toolbar,
  useGenContext,
  useGenerated,
  useWindow,
} from '@slop/sdk'

const SHELF = [
  { title: 'Warm paper', subtitle: 'The color of the desk' },
  { title: 'Tangerine', subtitle: 'An accent, used once' },
  { title: 'A quiet timer', subtitle: 'What a small tool owes you' },
  { title: 'Ada Lovelace', subtitle: 'Notes toward the machine' },
]

export default function App() {
  const { setTitle } = useWindow()
  const [query, setQuery] = useState('')
  useGenContext({
    purpose: 'A personal encyclopedia. The shelf is real; pages beyond it are generated.',
    shelf: SHELF.map((page) => page.title),
  })

  const lede = useGenerated<{ title: string; summary: string }>({
    intent: 'A two-sentence welcome to a personal mini wiki',
    kind: 'content',
    schema: {
      type: 'object',
      properties: { title: { type: 'string' }, summary: { type: 'string' } },
      required: ['title', 'summary'],
    },
  })

  useEffect(() => {
    setTitle('Wiki')
  }, [setTitle])

  return (
    <Stack gap={0} style={{ height: '100%' }}>
      <Toolbar title="Wiki" />
      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={16} padding={20} style={{ maxWidth: 560 }}>
          <Stack gap={6}>
            <Heading>{lede.status === 'ready' && lede.data ? lede.data.title : 'Wiki'}</Heading>
            {lede.status === 'loading' ? (
              <p className="slop-material-status">
                <span className="slop-material-dot" aria-hidden />
                <span>{lede.progress || 'Writing a welcome…'}</span>
              </p>
            ) : null}
            {lede.status === 'error' ? (
              <Stack gap={8}>
                <Text muted>{lede.error}</Text>
                <Button size="sm" onClick={lede.regenerate}>
                  Try again
                </Button>
              </Stack>
            ) : null}
            {lede.status === 'ready' && lede.data ? <Text muted>{lede.data.summary}</Text> : null}
          </Stack>
          <SearchField value={query} onChange={setQuery} placeholder="Look something up" aria-label="Search the wiki" />
          <Card>
            <List aria-label="Shelf">
              {SHELF.map((page) => (
                <ListItem key={page.title} icon="BookOpen" title={page.title} subtitle={page.subtitle} />
              ))}
            </List>
          </Card>
          <Text size="sm" muted>
            The shelf is the app. <Link>How a page stays the same</Link> is not — it is generated when you open it.
          </Text>
        </Stack>
      </ScrollArea>
    </Stack>
  )
}
