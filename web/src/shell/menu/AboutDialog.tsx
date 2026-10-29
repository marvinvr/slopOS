import { useEffect } from 'react'
import { Button } from '../../design/kit'
import { SLOP_VERSION } from '../../version'
import { providerLabel, useGrokStatus } from '../generation'
import { Mark } from '../icons'
import { pushLayer } from '../layers'
import { useShell } from '../store'

export function AboutDialog() {
  const open = useShell((state) => state.aboutOpen)
  const close = useShell((state) => state.setAboutOpen)
  const provider = providerLabel(useGrokStatus().provider)

  useEffect(() => {
    if (!open) return
    return pushLayer(() => close(false))
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
        <p className="written">Apps are written by {provider}.</p>
        <div style={{ marginTop: 18 }}>
          <Button variant="primary" onClick={() => close(false)}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
