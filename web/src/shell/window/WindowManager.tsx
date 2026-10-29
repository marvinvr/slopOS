import { useEffect } from 'react'
import { useShell } from '../store'
import { Window } from './Window'

export function WindowManager() {
  const windows = useShell((state) => state.windows)
  const refit = useShell((state) => state.refitMaximized)

  useEffect(() => {
    const onResize = () => refit()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [refit])

  return (
    <div className="shell-stage">
      {windows.map((win) => (
        <Window key={win.id} win={win} />
      ))}
    </div>
  )
}
