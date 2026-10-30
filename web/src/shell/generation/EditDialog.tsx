import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Heading, Row, TextArea } from '../../design/kit'
import { AppTile } from '../icons'
import { closeEdit, submitEdit } from './state'
import { useShell } from '../store'

export function EditDialog({ appId }: { appId: string }) {
  const app = useShell((state) => state.apps.find((item) => item.id === appId))
  const [prompt, setPrompt] = useState('')

  const submit = () => {
    if (!prompt.trim()) return
    submitEdit(appId, prompt)
  }

  return createPortal(
    <div className="gen-scrim" onMouseDown={closeEdit}>
      <section
        className="gen-edit"
        role="dialog"
        aria-label={`Customize ${app?.name || 'app'}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Row gap={10} align="center">
          {app ? <AppTile id={app.id} icon={app.icon} tint={app.tint} size={28} /> : null}
          <Heading level={2}>Customize {app?.name || 'App'}</Heading>
        </Row>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
            if (event.key === 'Escape') closeEdit()
          }}
        >
          <TextArea value={prompt} rows={4} placeholder="Changes" aria-label="Changes" onChange={setPrompt} />
        </form>
        <Row gap={8} justify="flex-end">
          <Button variant="ghost" onClick={closeEdit}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!prompt.trim()} onClick={submit}>
            Apply
          </Button>
        </Row>
      </section>
    </div>,
    document.body,
  )
}
