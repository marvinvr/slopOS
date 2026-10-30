import { cx } from '../../design/kit/cx'
import { providerLabel, startGeneration, useGrokStatus } from '../generation'
import { Mark } from '../icons'
import { EXAMPLE_PROMPTS } from './examples'

export function Invite({ embedded = false, onPick }: { embedded?: boolean; onPick?: () => void }) {
  const status = useGrokStatus()
  const provider = providerLabel(status.provider)
  const unavailable = !status.available && status.reason !== 'Checking…'
  const reason = (status.reason || '').replace(/`/g, '').trim()
  return (
    <div className={cx('shell-invite', embedded && 'is-embedded')}>
      <div className="shell-invite-card">
        <div className="shell-invite-mark">
          <Mark size={embedded ? 36 : 48} />
        </div>
        <h1>What should we make?</h1>
        {unavailable ? (
          <p>{reason || (provider ? `${provider} isn’t available right now.` : 'The generator isn’t available right now.')}</p>
        ) : (
          <>
            <p>
              {provider
                ? `Every app on this desk is written by ${provider}. Describe one, and it will live here.`
                : 'Every app on this desk is written the moment you describe it.'}
            </p>
            <div className="shell-chips">
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  className="shell-chip"
                  onClick={() => {
                    startGeneration(example.prompt)
                    onPick?.()
                  }}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
