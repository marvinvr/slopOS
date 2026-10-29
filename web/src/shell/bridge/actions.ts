import type { SlopMessage } from '../../../../runtime/protocol'
import { useShell } from '../store'

/** openApp, clipboard.write, and download. confirm() stays inside the app window. */
export async function routeActionMessage(message: SlopMessage, reply: (payload: unknown) => void): Promise<boolean> {
  const payload = (message.payload ?? {}) as Record<string, unknown>
  if (message.type === 'openApp') {
    const id = typeof payload.appId === 'string' ? payload.appId : ''
    if (id) useShell.getState().openApp(id)
    return true
  }
  if (message.type === 'clipboard.write') {
    const text = typeof payload.text === 'string' ? payload.text : ''
    try {
      await navigator.clipboard.writeText(text)
      reply({ ok: true })
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.left = '-1000px'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      reply(ok ? { ok: true } : { error: 'Clipboard unavailable' })
    }
    return true
  }
  if (message.type === 'download') {
    const filename = sanitize(typeof payload.filename === 'string' ? payload.filename : 'download')
    const mime = typeof payload.mime === 'string' ? payload.mime : 'application/octet-stream'
    const raw = typeof payload.data === 'string' ? payload.data : ''
    try {
      const blob = payload.encoding === 'base64' ? new Blob([bytesFromBase64(raw)], { type: mime }) : new Blob([raw], { type: mime })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      reply({ ok: true })
    } catch (err) {
      reply({ error: err instanceof Error ? err.message : 'Download failed' })
    }
    return true
  }
  return false
}

function sanitize(filename: string): string {
  const name = filename.replace(/[/\\]/g, '').trim()
  return name || 'download'
}

function bytesFromBase64(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
