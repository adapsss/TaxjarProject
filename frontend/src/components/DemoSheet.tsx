import { useState } from 'react'
import { useScenarios, type Scenario } from '../state/scenarios'
import { useStore, type PresetChoice } from '../state/store'
import { formatMoney } from '../lib/money'
import { Button, CircleButton, CloseIcon, Sheet, SparkleIcon, Spinner, Switch } from './ui'

// Filled / Empty / Not set up reset the backend to that state; Live leaves it as it is.
const PRESETS: { id: PresetChoice; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'filled', label: 'Filled' },
  { id: 'empty', label: 'Empty' },
  { id: 'not-set-up', label: 'Not set up' },
  { id: 'loading', label: 'Loading' },
  { id: 'error', label: 'Error' },
]

/** Hackathon-only controls: fixed test payments and screen states. Not part of the product UI. */
export function DemoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { simulate, busy, preset, setPreset, failNext, setFailNext } = useStore()
  const { scenarios } = useScenarios()
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const send = (s: Scenario) => {
    setError(null)
    simulate(s, `sim:${s.id}`).then(onClose, (e: Error) => setError(e.message))
  }
  const choose = (id: PresetChoice) => {
    setError(null)
    setPreset(id)
    onClose()
  }

  return (
    <Sheet label="Demo controls" onClose={onClose} className="max-h-[92%]">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-lime text-forest">
            <SparkleIcon className="size-[18px]" />
          </span>
          <div>
            <h2 className="text-[20px] font-extrabold tracking-[-0.03em]">Demo controls</h2>
            <p className="text-[12px] text-muted">Not part of the app · synthetic data</p>
          </div>
        </div>
        <CircleButton label="Close demo controls" size={36} onClick={onClose}>
          <CloseIcon className="size-4" />
        </CircleButton>
      </div>

      <div className="min-h-0 overflow-y-auto px-5 pt-3 pb-7">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">Send a test payment</p>
        <div className="mt-2.5 overflow-hidden rounded-2xl bg-canvas">
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              data-testid={`demo-sim-${s.id}`}
              disabled={!!busy}
              onClick={() => send(s)}
              className="press flex w-full cursor-pointer items-center justify-between gap-3 border-b border-line/70 px-4 py-3 text-left last:border-b-0 hover:bg-soft disabled:cursor-wait disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{s.senderName}</span>
                <span className="block truncate text-[12px] text-muted">{s.reference || s.label}</span>
              </span>
              <span className="money flex shrink-0 items-center gap-1.5 text-[13px] font-bold text-forest">
                {busy === `sim:${s.id}` && <Spinner className="size-3" />}
                {formatMoney(s.amount, s.currency)}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">Screen state</p>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`demo-state-${p.id}`}
              aria-pressed={preset === p.id}
              onClick={() => choose(p.id)}
              className={`press cursor-pointer rounded-full px-2 py-2.5 text-[12.5px] font-semibold ${
                preset === p.id ? 'bg-forest text-white' : 'bg-soft text-ink hover:bg-[#e6e6de]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl bg-canvas px-4 py-3.5">
          <div>
            <p className="text-[14px] font-semibold">Next action fails</p>
            <p className="text-[12px] text-muted">Shows the error path without touching the backend.</p>
          </div>
          <Switch checked={failNext} onChange={setFailNext} label="Next action fails" />
        </div>

        {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-[13px] text-danger">{error}</p>}

        <Button variant="secondary" size="lg" className="mt-5 w-full" onClick={onClose}>
          Done
        </Button>
        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-muted">
          Test payments really reach the local FastAPI backend. Do not run this prototype in public.
        </p>
      </div>
    </Sheet>
  )
}
