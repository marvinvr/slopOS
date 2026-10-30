import { useState } from 'react'
import { Button } from '../../design/kit'
import { enterFullscreen } from '../fullscreen'
import { providerLabel, useGrokStatus } from '../generation'
import { Mark } from '../icons'
import { markWelcome, welcomeSeen } from '../local'

export function Welcome() {
  const [open, setOpen] = useState(() => !welcomeSeen())
  const provider = providerLabel(useGrokStatus().provider)
  if (!open) return null

  function stay() {
    markWelcome()
    setOpen(false)
  }

  async function enter() {
    markWelcome()
    setOpen(false)
    await enterFullscreen()
  }

  return (
    <div className="shell-welcome">
      <div className="shell-welcome-card">
        <div className="shell-about-mark">
          <Mark size={52} />
        </div>
        <h1>slopOS</h1>
        <p>
          {provider
            ? `Every app here is written by ${provider}, the moment you ask for it.`
            : 'Every app here is written the moment you ask for it.'}
        </p>
        <div className="shell-welcome-actions">
          <Button variant="primary" onClick={() => void enter()}>
            Enter slopOS
          </Button>
        </div>
        <button type="button" className="shell-welcome-stay" onClick={stay}>
          Stay in window
        </button>
      </div>
    </div>
  )
}
