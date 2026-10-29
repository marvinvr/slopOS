import { useEffect } from 'react'
import { Button } from '../../design/kit'
import { SLOP_VERSION } from '../../version'
import { Mark } from '../icons'
import { useShell } from '../store'

export function AboutDialog() {
  const open = useShell((state) => state.aboutOpen)
  const close = useShell((state) => state.setAboutOpen)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null
  return (
    <div className="shell-about-backdrop" onPointerDown={() => close(false)}>
      <div className="shell-about" role="dialog" aria-modal="true" aria-labelledby="slop-about-title" onPointerDown={(event) => event.stopPropagation()}>
        <div className="shell-about-mark">
          <Mark size={44} />
        </div>
        <h1 id="slop-about-title">slopOS</h1>
        <p className="version">Version {SLOP_VERSION}</p>
        <p className="line">A calm desktop for small apps.</p>
        <p className="written">Apps are written by Grok.</p>
        <div style={{ marginTop: 18 }}>
          <Button variant="primary" onClick={() => close(false)}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
