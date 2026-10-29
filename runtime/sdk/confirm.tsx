import { useEffect, useState } from 'react'
import { Button, Dialog, Row, Text } from '../../web/src/design/kit'

type Ask = (message: string) => Promise<boolean>

let ask: Ask | null = null

/** In-window confirmation. Resolves false if the frame has no dialog host yet. */
export function confirm(message: string): Promise<boolean> {
  if (!ask) return Promise.resolve(false)
  return ask(message)
}

export function setConfirmHost(next: Ask | null): void {
  ask = next
}

export function ConfirmHost() {
  const [pending, setPending] = useState<{ message: string; resolve: (value: boolean) => void } | null>(null)

  useEffect(() => {
    setConfirmHost((message) => new Promise((resolve) => setPending({ message, resolve })))
    return () => setConfirmHost(null)
  }, [])

  function close(value: boolean) {
    pending?.resolve(value)
    setPending(null)
  }

  return (
    <Dialog open={pending != null} title="Confirm" onClose={() => close(false)}>
      <Text>{pending?.message}</Text>
      <Row justify="end">
        <Button variant="secondary" onClick={() => close(false)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => close(true)}>
          Confirm
        </Button>
      </Row>
    </Dialog>
  )
}
