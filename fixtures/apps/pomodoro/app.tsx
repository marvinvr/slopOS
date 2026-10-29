import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Field,
  Heading,
  NumberInput,
  ProgressBar,
  Row,
  SegmentedControl,
  Stack,
  Text,
  notify,
  useInterval,
  useStorage,
  useWindow,
} from '@slop/sdk'

type Mode = 'focus' | 'short' | 'long'

const BREAKS: Record<Exclude<Mode, 'focus'>, number> = { short: 5, long: 15 }

export default function App() {
  const { setTitle } = useWindow()
  const [focusMinutes, setFocusMinutes, { loaded }] = useStorage('focusMinutes', 25)
  const [mode, setMode] = useState<Mode>('focus')
  const [running, setRunning] = useState(false)
  const [left, setLeft] = useState(25 * 60)
  const [total, setTotal] = useState(25 * 60)
  const booted = useRef(false)

  useEffect(() => {
    setTitle('Pomodoro')
  }, [setTitle])

  useEffect(() => {
    if (!loaded || booted.current) return
    booted.current = true
    const secs = Math.max(1, focusMinutes) * 60
    setLeft(secs)
    setTotal(secs)
  }, [loaded, focusMinutes])

  useInterval(() => {
    setLeft((value) => (value <= 1 ? 0 : value - 1))
  }, running ? 1000 : null)

  useEffect(() => {
    if (!running || left > 0) return
    setRunning(false)
    notify('Pomodoro', mode === 'focus' ? 'That’s a session. Take a breath.' : 'Break’s over. Back when you’re ready.')
  }, [left, running, mode])

  function apply(next: Mode, minutes = focusMinutes) {
    const mins = next === 'focus' ? minutes : BREAKS[next]
    const secs = Math.max(1, mins) * 60
    setMode(next)
    setRunning(false)
    setLeft(secs)
    setTotal(secs)
  }

  const minutes = String(Math.floor(left / 60)).padStart(2, '0')
  const seconds = String(left % 60).padStart(2, '0')
  const done = left === 0

  return (
    <Stack gap={18} align="center" justify="center" style={{ height: '100%', padding: 28 }}>
      <style>{`
        .pomo-time { margin: 0; font-family: var(--slop-font-display); font-size: 72px; font-weight: 520; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; line-height: 1; }
      `}</style>
      <Stack gap={4} align="center">
        <Heading>Pomodoro</Heading>
        <Text muted size="sm">
          One tomato at a time.
        </Text>
      </Stack>
      <SegmentedControl
        aria-label="Session"
        value={mode}
        options={[
          { value: 'focus', label: 'Focus' },
          { value: 'short', label: 'Short' },
          { value: 'long', label: 'Long' },
        ]}
        onChange={(value) => apply(value as Mode)}
      />
      <p className="pomo-time">
        {minutes}:{seconds}
      </p>
      <div style={{ width: 'min(240px, 100%)' }}>
        <ProgressBar value={total ? (total - left) / total : 0} label="Session" />
      </div>
      <Row>
        <Button variant="primary" onClick={() => (done ? apply(mode) : setRunning((value) => !value))}>
          {done ? 'Start again' : running ? 'Pause' : 'Start'}
        </Button>
        <Button variant="ghost" onClick={() => apply(mode)} disabled={left === total && !running}>
          Reset
        </Button>
      </Row>
      <Field label="Focus length" hint="Minutes, remembered for next time.">
        <NumberInput
          aria-label="Focus minutes"
          min={1}
          max={90}
          value={loaded ? focusMinutes : 25}
          disabled={!loaded || running}
          onChange={(value) => {
            setFocusMinutes(value)
            if (mode === 'focus') apply('focus', value)
          }}
        />
      </Field>
    </Stack>
  )
}
