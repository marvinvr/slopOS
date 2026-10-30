import { useEffect, useState } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  ColorSwatch,
  Dialog,
  Divider,
  EmptyState,
  Field,
  Grid,
  Heading,
  IconButton,
  Input,
  Kbd,
  Link,
  List,
  ListItem,
  Menu,
  NumberInput,
  ProgressBar,
  Row,
  ScrollArea,
  SearchField,
  Section,
  SegmentedControl,
  Select,
  Sheet,
  Slider,
  Spinner,
  SplitView,
  Stack,
  Switch,
  Table,
  Tabs,
  Tag,
  Text,
  TextArea,
  Toolbar,
  Tooltip,
  confirm,
  useTheme,
  useWindow,
} from '@slop/sdk'

export default function App() {
  const { setTitle } = useWindow()
  const { mode } = useTheme()
  const [name, setName] = useState('Ada')
  const [notes, setNotes] = useState('A short note, set in the window.')
  const [choice, setChoice] = useState('one')
  const [checked, setChecked] = useState(true)
  const [on, setOn] = useState(true)
  const [amount, setAmount] = useState(40)
  const [count, setCount] = useState(3)
  const [segment, setSegment] = useState('day')
  const [color, setColor] = useState('#e4532d')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('buttons')
  const [chip, setChip] = useState('warm')
  const [dialog, setDialog] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [sortNote, setSortNote] = useState('Name')

  useEffect(() => {
    setTitle('Kit')
  }, [setTitle])

  return (
    <Stack gap={0} style={{ height: '100%' }}>
      <Toolbar title="Kit" trailing={<Badge tone="accent">{mode}</Badge>} />
      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={22} padding={20}>
          <Stack gap={4}>
            <Heading>The kit</Heading>
            <Text muted>Every control, in the theme the menu bar is using. Handler-less buttons carry a small sparkle.</Text>
          </Stack>

          <Section title="Buttons" description="32px by default, 28px when small.">
            <Row wrap>
              <Button variant="primary">Save</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Delete</Button>
              <Button size="sm" variant="primary">Small</Button>
              <Button disabled>Disabled</Button>
              <IconButton icon="Plus" label="Add" />
              <IconButton icon="Pencil" label="Edit" variant="secondary" size="sm" />
              <Tooltip label="Copies nothing, happily">
                <Button size="sm" variant="ghost" onClick={() => setSortNote('Still here')}>
                  Hover me
                </Button>
              </Tooltip>
            </Row>
          </Section>

          <Section title="Fields">
            <Grid columns={2} gap={14} minChildWidth={220}>
              <Field label="Name" hint="Shown on the avatar.">
                <Input value={name} onChange={setName} placeholder="Name" aria-label="Name" />
              </Field>
              <Field label="Kind">
                <Select
                  aria-label="Kind"
                  value={choice}
                  onChange={setChoice}
                  options={[
                    { value: 'one', label: 'One' },
                    { value: 'two', label: 'Two' },
                  ]}
                />
              </Field>
              <Field label="Search">
                <SearchField value={query} onChange={setQuery} onSearch={() => setSortNote(query || 'Search')} placeholder="Filter" aria-label="Filter" />
              </Field>
              <Field label="Count" hint="Stepper, 28 or 32 tall.">
                <NumberInput aria-label="Count" value={count} min={0} max={12} onChange={setCount} />
              </Field>
              <Field label="Note">
                <TextArea value={notes} onChange={setNotes} rows={3} aria-label="Note" />
              </Field>
              <Stack gap={10}>
                <Checkbox checked={checked} label="Remember this" onChange={setChecked} />
                <Switch checked={on} label="Soft chime" onChange={setOn} />
                <Slider value={amount} onChange={setAmount} aria-label="Amount" />
              </Stack>
            </Grid>
          </Section>

          <Section title="Choices">
            <Row wrap>
              <SegmentedControl
                aria-label="Range"
                size="sm"
                value={segment}
                onChange={setSegment}
                options={[
                  { value: 'day', label: 'Day' },
                  { value: 'week', label: 'Week' },
                  { value: 'month', label: 'Month' },
                ]}
              />
              <Tabs
                aria-label="Catalog"
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: 'buttons', label: 'Controls' },
                  { value: 'type', label: 'Type' },
                ]}
              />
            </Row>
            <Row wrap>
              <Chip selected={chip === 'warm'} onClick={() => setChip('warm')}>Warm</Chip>
              <Chip selected={chip === 'quiet'} onClick={() => setChip('quiet')}>Quiet</Chip>
              <Chip size="sm" onClick={() => setChip('ink')}>Ink</Chip>
              <Tag>Draft</Tag>
              <Tag tone="accent">Accent</Tag>
              <Tag tone="success" onRemove={() => setSortNote('Removed')}>Done</Tag>
              <Tag tone="warning">Soon</Tag>
              <Tag tone="danger">Late</Tag>
            </Row>
            <Field label="Swatch">
              <ColorSwatch value={color} onChange={setColor} aria-label="Accent swatch" />
            </Field>
          </Section>

          <Section title="Feedback">
            <Stack gap={8}>
              <ProgressBar value={0.45} label="Almost" />
              <ProgressBar label="Working" />
            </Stack>
            <Row wrap>
              <Badge>Neutral</Badge>
              <Badge tone="accent">Accent</Badge>
              <Badge tone="success">Saved</Badge>
              <Badge tone="warning">Wait</Badge>
              <Badge tone="danger">Error</Badge>
              <Spinner />
              <Kbd>⌘K</Kbd>
              <Avatar name={name || 'Ada'} />
              <Avatar name="Lin" size={36} />
            </Row>
          </Section>

          <Section title="Text">
            <Heading>Display heading</Heading>
            <Heading level={2}>Section heading</Heading>
            <Heading level={3}>Label heading</Heading>
            <Text>Body copy sits at 13px, in Inter, on warm paper.</Text>
            <Text muted size="sm">Muted secondary line.</Text>
            <Link onClick={() => setSortNote('Link')}>A real link</Link>
            <Text>
              And a generated one: <Link intent="The history of warm paper">warm paper</Link>
            </Text>
          </Section>

          <Section title="Surfaces">
            <Grid columns={3} gap={12} minChildWidth={180}>
              <Card>
                <Stack gap={4}>
                  <Text size="sm" muted>Static</Text>
                  <Heading level={3}>A card</Heading>
                </Stack>
              </Card>
              <Card onClick={() => setSortNote('Clicked')}>
                <Stack gap={4}>
                  <Text size="sm" muted>Clickable</Text>
                  <Heading level={3}>Press me</Heading>
                </Stack>
              </Card>
              <Card intent="Open the card’s story">
                <Stack gap={4}>
                  <Text size="sm" muted>Generative</Text>
                  <Heading level={3}>No handler</Heading>
                </Stack>
              </Card>
            </Grid>
            <Divider />
            <div style={{ height: 168 }}>
              <SplitView style={{ height: 168 }}
                resizable
                sidebarWidth={180}
                sidebar={
                  <Stack padding={8}>
                    <List aria-label="Sample">
                      <ListItem title="Milk" subtitle="Today" selected onClick={() => setSortNote('Milk')} />
                      <ListItem title="A generated row" subtitle="No handler" icon="Sparkles" />
                    </List>
                  </Stack>
                }
              >
                <Stack padding={12} gap={8}>
                  <Text>Drag the hairline. The row without a handler is generative.</Text>
                  <Text muted size="sm">{sortNote}</Text>
                </Stack>
              </SplitView>
            </div>
          </Section>

          <Section title="Table">
            <Table
              aria-label="Sample rows"
              rows={[
                { name: 'Ada', streak: 4 },
                { name: 'Lin', streak: 12 },
                { name: 'Mo', streak: 1 },
              ]}
              rowKey={(row) => row.name}
              columns={[
                { key: 'name', header: 'Name', sortable: true },
                { key: 'streak', header: 'Streak', sortable: true, align: 'end' },
              ]}
            />
          </Section>

          <Section title="Overlays">
            <Row wrap>
              <Menu
                trigger={<Button size="sm">Menu</Button>}
                items={[
                  { label: 'Rename', shortcut: '↩', onSelect: () => setSortNote('Rename') },
                  'separator',
                  { label: 'Delete', danger: true, onSelect: () => setSortNote('Delete') },
                ]}
              />
              <Button size="sm" onClick={() => setDialog(true)}>Dialog</Button>
              <Button size="sm" variant="secondary" onClick={() => setSheet(true)}>Sheet</Button>
              <Button size="sm" variant="secondary" onClick={() => { void confirm('Keep this note?').then((ok) => setSortNote(ok ? 'Kept' : 'Cancelled')) }}>Confirm</Button>
              <Button>Open a generated note</Button>
            </Row>
            <EmptyState icon="Palette" title="Nothing missing" body="Empty states get one soft shape, not a lecture." />
          </Section>
        </Stack>
      </ScrollArea>
      <Dialog open={dialog} title="A small dialog" onClose={() => setDialog(false)}>
        <Field label="Name" hint="Focus lands here. Enter confirms.">
          <Input value={name} onChange={setName} aria-label="Dialog name" />
        </Field>
        <Row justify="end">
          <Button variant="ghost" onClick={() => setDialog(false)}>Close</Button>
          <Button variant="primary" onClick={() => { setSortNote(name); setDialog(false) }}>Okay</Button>
        </Row>
      </Dialog>
      <Sheet open={sheet} title="Details" onClose={() => setSheet(false)}>
        <Field label="Note">
          <Input value={notes} onChange={setNotes} aria-label="Sheet note" />
        </Field>
        <Text muted>A sheet for a side thought. Escape or the backdrop puts it away.</Text>
        <Button variant="primary" onClick={() => setSheet(false)}>Done</Button>
      </Sheet>
    </Stack>
  )
}
