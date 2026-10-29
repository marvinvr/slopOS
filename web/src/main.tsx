import '@fontsource-variable/fraunces'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design/tokens.css'
import './shell/shell.css'
import { Desktop } from './shell/Desktop'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Desktop />
    </StrictMode>,
  )
}
