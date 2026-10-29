import { useEffect } from 'react'
import { Badge, Button, Card, Heading, Row, Stack, Text, notify, useMenu, useStorage, useTheme, useWindow } from '@slop/sdk'

export default function App() {
  const { setTitle } = useWindow()
  const theme = useTheme()
  const [count, setCount, { loaded }] = useStorage('count', 0)

  useEffect(() => {
    setTitle('Hello')
  }, [setTitle])

  useMenu([
    {
      label: 'Hello',
      items: [{ label: 'Reset', disabled: count === 0, onSelect: () => setCount(0) }],
    },
  ])

  return (
    <Stack gap={16} style={{ height: '100%', padding: 20, justifyContent: 'center' }}>
      <Stack gap={4}>
        <Heading>Hello</Heading>
        <Text muted>A small fixture app. It remembers a number and can knock on the shell.</Text>
      </Stack>
      <Card>
        <Row justify="space-between">
          <Stack gap={4}>
            <Text size="sm" muted>
              Count
            </Text>
            <Heading level={2}>{loaded ? count : '…'}</Heading>
          </Stack>
          <Badge tone="accent">{theme.mode}</Badge>
        </Row>
        <Row gap={8} style={{ marginTop: 14 }}>
          <Button
            variant="primary"
            onClick={() => {
              const next = count + 1
              setCount(next)
              notify('Hello', `Count is ${next}`)
            }}
          >
            Add one
          </Button>
          <Button variant="ghost" disabled={count === 0} onClick={() => setCount(0)}>
            Reset
          </Button>
        </Row>
      </Card>
    </Stack>
  )
}
