import { useState } from 'react'
import { Button } from '../../design/kit'
import { enterFullscreen, rememberWelcome, welcomeChoice } from '../fullscreen'
import { Mark } from '../icons'

/** First visit only. The choice is remembered; the logo menu can enter full screen later. */
export function Welcome() {
  const [open, setOpen] = useState(() => welcomeChoice() === null)
  if (!open) return null

  function finish(choice: 'full' | 'window') {
    rememberWelcome(choice)
    setOpen(false)
    window.dispatchEvent(new Event('slop-welcome'))
  }

  function stay() {
    finish('window')
  }

  function jump() {
    finish('full')
    void enterFullscreen().catch(() => rememberWelcome('window'))
  }

  return (
    <div className="shell-welcome" role="dialog" aria-modal="true" aria-labelledby="slop-welcome-title">
      <div className="shell-welcome-card">
        <Mark size={56} />
        <h1 id="slop-welcome-title">slopOS</h1>
        <p>A warm little desktop. Apps are written by Grok.</p>
        <Button variant="primary" onClick={jump}>
          Enter slopOS
        </Button>
        <button type="button" className="shell-welcome-stay" onClick={stay}>
          Stay in window
        </button>
      </div>
    </div>
  )
}
