import { useEffect, useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  Input,
  Row,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Tag,
  Text,
  Toolbar,
  useStorage,
  useWindow,
} from '@slop/sdk'

type Habit = { id: string; name: string; cadence: 'Daily' | 'Weekdays'; streak: number; doneOn: string }

const SEED: Habit[] = [
  { id: 'water', name: 'Drink a glass of water', cadence: 'Daily', streak: 4, doneOn: '' },
  { id: 'walk', name: 'Walk around the block', cadence: 'Daily', streak: 2, doneOn: '' },
  { id: 'pages', name: 'Read ten pages', cadence: 'Weekdays', streak: 6, doneOn: '' },
]

export default function App() {
  const { setTitle } = useWindow()
  const [habits, setHabits, { loaded }] = useStorage<Habit[]>('habits', SEED)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState<'Daily' | 'Weekdays'>('Daily')

  useEffect(() => {
    setTitle('Habits')
  }, [setTitle])

  const day = new Date().toISOString().slice(0, 10)

  function toggle(habit: Habit, done: boolean) {
    setHabits((list) =>
      list.map((item) => {
        if (item.id !== habit.id) return item
        if (done) return { ...item, doneOn: day, streak: item.doneOn === day ? item.streak : item.streak + 1 }
        return { ...item, doneOn: '', streak: item.doneOn === day ? Math.max(0, item.streak - 1) : item.streak }
      }),
    )
  }

  function add() {
    const label = name.trim()
    if (!label) return
    setHabits((list) => [{ id: crypto.randomUUID(), name: label, cadence, streak: 0, doneOn: '' }, ...list])
    setName('')
    setCadence('Daily')
    setOpen(false)
  }

  return (
    <Stack gap={0} style={{ height: '100%' }}>
      <Toolbar
        title="Habits"
        trailing={
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            New habit
          </Button>
        }
      />
      <ScrollArea style={{ flex: 1 }}>
        {!loaded ? (
          <Text muted style={{ padding: 20 }}>
            Opening the list…
          </Text>
        ) : habits.length === 0 ? (
          <EmptyState icon="ListChecks" title="Nothing repeating yet" body="Add one small thing you can finish today.">
            <Button variant="primary" onClick={() => setOpen(true)}>
              New habit
            </Button>
          </EmptyState>
        ) : (
          <div style={{ padding: 8 }}>
            <Table
              aria-label="Habits"
              rows={habits}
              rowKey={(row) => row.id}
              columns={[
                { key: 'name', header: 'Habit', sortable: true },
                {
                  key: 'cadence',
                  header: 'Cadence',
                  sortable: true,
                  render: (row) => <Tag tone={row.cadence === 'Daily' ? 'accent' : 'neutral'}>{row.cadence}</Tag>,
                },
                { key: 'streak', header: 'Streak', sortable: true, align: 'end', width: 90 },
                {
                  key: 'doneOn',
                  header: 'Today',
                  width: 88,
                  align: 'end',
                  render: (row) => <Checkbox checked={row.doneOn === day} aria-label={`Done: ${row.name}`} onChange={(done) => toggle(row, done)} />,
                },
              ]}
            />
          </div>
        )}
      </ScrollArea>
      <Dialog open={open} title="New habit" onClose={() => setOpen(false)}>
        <Field label="Name" hint="Short enough to read in the table.">
          <Input value={name} onChange={setName} placeholder="Stretch for two minutes" aria-label="Habit name" autoFocus />
        </Field>
        <Field label="Cadence">
          <SegmentedControl
            aria-label="Cadence"
            value={cadence}
            onChange={(value) => setCadence(value as 'Daily' | 'Weekdays')}
            options={[
              { value: 'Daily', label: 'Daily' },
              { value: 'Weekdays', label: 'Weekdays' },
            ]}
          />
        </Field>
        <Row justify="end">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={add}>
            Add
          </Button>
        </Row>
      </Dialog>
    </Stack>
  )
}
