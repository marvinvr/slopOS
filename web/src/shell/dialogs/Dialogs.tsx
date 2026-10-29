import { useEffect, useRef, useState } from 'react'
import { Button } from '../../design/kit'
import { deleteApp, resetWorld } from '../actions'
import { restoreAppVersion } from '../generation'
import { pushLayer } from '../layers'
import { useShell } from '../store'

export function ShellDialogs() {
  const prompt = useShell((state) => state.shellPrompt)
  const close = useShell((state) => state.setShellPrompt)
  if (!prompt) return null
  if (prompt.kind === 'reset') {
    return (
      <Confirm
        title="Reset slopOS?"
        body="This erases every app and everything in this world. slopOS starts fresh."
        confirmLabel="Reset"
        onCancel={() => close(null)}
        onConfirm={() => resetWorld()}
      />
    )
  }
  if (prompt.kind === 'delete') return <DeleteDialog appId={prompt.appId} onClose={() => close(null)} />
  return <HistoryDialog appId={prompt.appId} onClose={() => close(null)} />
}

function Confirm({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => Promise<boolean>
  onCancel: () => void
}) {
  const [pending, setPending] = useState(false)
  const cancelRef = useRef<HTMLSpanElement>(null)
  const cancelRefFn = useRef(onCancel)
  cancelRefFn.current = onCancel

  useEffect(() => pushLayer(() => cancelRefFn.current()), [])
  useEffect(() => {
    cancelRef.current?.querySelector('button')?.focus()
  }, [])

  return (
    <div className="shell-confirm-backdrop" onPointerDown={onCancel}>
      <div className="shell-confirm" role="dialog" aria-modal="true" aria-labelledby="slop-confirm-title" onPointerDown={(event) => event.stopPropagation()}>
        <h2 id="slop-confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="shell-confirm-actions">
          <span ref={cancelRef}>
            <Button onClick={onCancel}>Cancel</Button>
          </span>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              setPending(true)
              void onConfirm().then((ok) => {
                if (ok) onCancel()
                else setPending(false)
              })
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function DeleteDialog({ appId, onClose }: { appId: string; onClose: () => void }) {
  const name = useShell((state) => state.apps.find((app) => app.id === appId)?.name) || 'this app'
  return (
    <Confirm
      title={`Delete ${name}?`}
      body="This removes the app and everything it stored."
      confirmLabel="Delete"
      onCancel={onClose}
      onConfirm={() => deleteApp(appId)}
    />
  )
}

type HistoryRow = { label: string; detail?: string; version?: number }

function HistoryDialog({ appId, onClose }: { appId: string; onClose: () => void }) {
  const name = useShell((state) => state.apps.find((app) => app.id === appId)?.name) || 'App'
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [version, setVersion] = useState<number | null>(null)
  const [fixture, setFixture] = useState(false)
  const [failed, setFailed] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => pushLayer(() => closeRef.current()), [])

  useEffect(() => {
    let cancel = false
    fetch(`/api/apps/${encodeURIComponent(appId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('missing')
        return (await res.json()) as { manifest?: Record<string, unknown> }
      })
      .then((body) => {
        if (cancel) return
        const manifest = body.manifest ?? {}
        if (typeof manifest.version === 'number') setVersion(manifest.version)
        setFixture(manifest.fixture === true)
        setRows(readHistory(manifest))
      })
      .catch(() => {
        if (!cancel) setFailed(true)
      })
    return () => {
      cancel = true
    }
  }, [appId])

  const restore = (target: number) => {
    setBusy(true)
    setNote('')
    void restoreAppVersion(appId, target)
      .then(() => onClose())
      .catch((err: unknown) => {
        setNote(err instanceof Error ? err.message : 'Could not restore that version')
        setBusy(false)
      })
  }

  return (
    <div className="shell-confirm-backdrop" onPointerDown={onClose}>
      <div className="shell-confirm shell-history" role="dialog" aria-modal="true" aria-labelledby="slop-history-title" onPointerDown={(event) => event.stopPropagation()}>
        <h2 id="slop-history-title">{name}</h2>
        <p>{version ? `Version ${version}` : 'Version history'}</p>
        <div className="shell-history-list">
          {failed ? <p>Couldn’t load the history.</p> : null}
          {!failed && rows && rows.length === 0 ? <p>This app has no earlier versions.</p> : null}
          {rows?.map((row, index) => (
            <div key={index} className="shell-history-row">
              {row.detail ? <span>{row.detail}</span> : null}
              <strong>{row.label}</strong>
              {!fixture && typeof row.version === 'number' && row.version !== version ? (
                <div className="shell-history-restore">
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => restore(row.version!)}>
                    Restore
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {note ? <p>{note}</p> : null}
        <div className="shell-confirm-actions">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}

function readHistory(manifest: Record<string, unknown>): HistoryRow[] {
  const rows: HistoryRow[] = []
  const version = typeof manifest.version === 'number' ? manifest.version : undefined
  const prompt = typeof manifest.prompt === 'string' ? manifest.prompt : undefined
  if (Array.isArray(manifest.prompts)) {
    manifest.prompts.forEach((entry, index) => {
      if (typeof entry === 'string') {
        rows.push({ label: entry, detail: `Edit ${index + 1}` })
        return
      }
      if (!entry || typeof entry !== 'object') return
      const record = entry as Record<string, unknown>
      const text = typeof record.prompt === 'string' ? record.prompt : typeof record.text === 'string' ? record.text : ''
      if (!text) return
      const rowVersion = typeof record.version === 'number' ? record.version : undefined
      const detail = rowVersion ? `Version ${rowVersion}` : `Edit ${index + 1}`
      rows.push({ label: text, detail, version: rowVersion })
    })
  }
  if (!rows.length && prompt) rows.push({ label: prompt, detail: version ? `Version ${version}` : 'Original', version })
  return rows
}
