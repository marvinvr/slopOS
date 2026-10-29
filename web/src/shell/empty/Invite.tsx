import { cx } from '../../design/kit/cx'
import { startGeneration } from '../generation'
import { Mark } from '../icons'
import { EXAMPLE_PROMPTS } from './examples'

export function Invite({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className={cx('shell-invite', embedded && 'is-embedded')}>
      <div className="shell-invite-card">
        <div className="shell-invite-mark">
          <Mark size={embedded ? 36 : 48} />
        </div>
        <h1>What should we make?</h1>
        <p>Every app on this desk is written by Grok. Describe one, and it will live here.</p>
        <div className="shell-chips">
          {EXAMPLE_PROMPTS.map((example) => (
            <button key={example.label} type="button" className="shell-chip" onClick={() => startGeneration(example.prompt)}>
              {example.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
