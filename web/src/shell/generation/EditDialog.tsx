import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Heading, Icon, Row, Stack, Text, TextArea } from '../../design/kit'
import { closeEdit, providerLabel, restoreAppVersion, submitEdit, useGeneration } from './state'
import { useShell } from '../store'

type HistoryEntry = { at: string; prompt: string; kind?: string; version?: number }

export function EditDialog({ appId }: { appId: string }) {
  const app = useShell((state) => state.apps.find((item) => item.id === appId))
  const provider = providerLabel(useGeneration().status.provider)
  const [prompt, setPrompt] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancel = false
    fetch(`/api/apps/${appId}`)
      .then((res) => res.json())
      .then((body: { manifest?: { prompts?: HistoryEntry[] } }) => {
        if (!cancel) setHistory(body.manifest?.prompts || [])
      })
      .catch(() => undefined)
    return () => {
      cancel = true
    }
  }, [appId])

  const submit = () => {
    if (!prompt.trim() || busy) return
    submitEdit(appId, prompt)
  }

  const revert = async (version: number) => {
    setBusy(true)
    setError('')
    try {
      await restoreAppVersion(appId, version)
      closeEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revert')
      setBusy(false)
    }
  }

  const versions = [...history].reverse().filter((entry) => typeof entry.version === 'number')

  return createPortal(
    <div className="gen-scrim" onMouseDown={closeEdit}>
      <section
        className="gen-edit"
        role="dialog"
        aria-label={`Edit ${app?.name || 'app'}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Row gap={10} align="center">
          <Icon name={app?.icon || 'Sparkles'} size={18} />
          <Heading level={2}>{app?.name || 'Edit'}</Heading>
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
          }}
        >
          <TextArea value={prompt} rows={4} placeholder="Describe the change…" aria-label="Describe the change" onChange={setPrompt} />
        </form>
        {error ? <Text size="sm">{error}</Text> : null}
        <Row gap={8} justify="flex-end">
          <Button variant="ghost" onClick={closeEdit}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!prompt.trim() || busy} onClick={submit}>
            Apply with {provider}
          </Button>
        </Row>
        {versions.length ? (
          <div className="gen-history">
            <Text muted size="sm">Versions</Text>
            <Stack gap={6}>
              {versions.map((entry) => (
                <Row key={`${entry.version}-${entry.at}`} gap={8} justify="space-between" align="center">
                  <div>
                    <Text size="sm">v{entry.version} · {entry.kind || 'edit'}</Text>
                    <Text muted size="xs">{clip(entry.prompt, 80)}</Text>
                  </div>
                  <Button size="sm" variant="ghost" disabled={busy || entry.version === app?.version} onClick={() => void revert(entry.version!)}>
                    Revert
                  </Button>
                </Row>
              ))}
            </Stack>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  )
}

function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trim()}…`
}
