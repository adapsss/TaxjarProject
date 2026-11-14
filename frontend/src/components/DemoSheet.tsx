import { useState, type FormEvent } from 'react'
import { useScenarios, type Scenario } from '../state/scenarios'
import { useStore, type PresetChoice } from '../state/store'
import { exponent, formatMoney } from '../lib/money'
import { currencyChoices } from '../lib/taxjar'
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
  const { simulate, busy, preset, setPreset, failNext, setFailNext, profile } = useStore()
  const [custom, setCustom] = useState({ senderName: '', amount: '', currency: 'EUR', reference: '' })
  const { scenarios } = useScenarios()
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const send = (s: Scenario) => {
    setError(null)
    simulate(s, `sim:${s.id}`).then(onClose, (e: Error) => setError(e.message))
  }
  const sendCustom = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    simulate(
      {
        senderName: custom.senderName,
        senderKind: null, // not declared: the engine decides from the name and reference
        // Major units in the form, minor units on the wire (none for JPY, three for KWD).
        amount: Math.round(Number(custom.amount) * 10 ** exponent(custom.currency)),
        currency: custom.currency,
        reference: custom.reference,
      },
      'sim:custom',
    ).then(onClose, (err: Error) => setError(err.message))
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
            <p className="text-[13px] text-muted">Not part of the app · synthetic data</p>
          </div>
        </div>
        <CircleButton label="Close demo controls" size={36} onClick={onClose}>
          <CloseIcon className="size-4" />
        </CircleButton>
      </div>

      <div className="min-h-0 overflow-y-auto px-5 pt-3 pb-7">
        <p className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Send a test payment</p>
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
                <span className="block truncate text-[15px] font-semibold">{s.senderName}</span>
                <span className="block truncate text-[13px] text-muted">
                  {s.reference || 'no reference'} · expect {s.expect === 'unknown' ? 'a question' : s.expect === 'income' ? 'tax set aside' : 'left untouched'}
                </span>
              </span>
              <span className="money flex shrink-0 items-center gap-1.5 text-[14px] font-bold text-accent">
                {busy === `sim:${s.id}` && <Spinner className="size-3" />}
                {formatMoney(s.amount, s.currency)}
              </span>
            </button>
          ))}
        </div>

        <details className="mt-3 rounded-2xl bg-canvas">
          <summary className="press flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
            Custom payment
            <span aria-hidden="true" className="text-[20px] leading-none text-muted">+</span>
          </summary>
          <form onSubmit={sendCustom} className="space-y-2.5 px-4 pb-4">
            <label className="block text-[13px] font-semibold text-muted">
              Sender
              <input
                required
                value={custom.senderName}
                onChange={(e) => setCustom({ ...custom, senderName: e.target.value })}
                placeholder="Judge Corp OÜ"
                autoComplete="off"
                className="mt-1 h-12 w-full rounded-xl bg-surface px-3.5 text-[16px] text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
              />
            </label>
            <div className="grid grid-cols-[1fr_104px] gap-2.5">
              <label className="block text-[13px] font-semibold text-muted">
                Amount
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={custom.amount}
                  onChange={(e) => setCustom({ ...custom, amount: e.target.value })}
                  placeholder="1500"
                  className="mt-1 h-12 w-full rounded-xl bg-surface px-3.5 text-[16px] text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
                />
              </label>
              <label className="block text-[13px] font-semibold text-muted">
                Currency
                <select
                  value={custom.currency}
                  onChange={(e) => setCustom({ ...custom, currency: e.target.value })}
                  className="mt-1 h-12 w-full rounded-xl bg-surface px-3 text-[16px] text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
                >
                  {currencyChoices(null, profile.taxCurrency).concat(['JPY', 'PLN']).filter((c, i, all) => all.indexOf(c) === i).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-[13px] font-semibold text-muted">
              Reference
              <input
                value={custom.reference}
                onChange={(e) => setCustom({ ...custom, reference: e.target.value })}
                placeholder="INV-042"
                autoComplete="off"
                className="mt-1 h-12 w-full rounded-xl bg-surface px-3.5 text-[16px] text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
              />
            </label>
            <Button type="submit" className="w-full" loading={busy === 'sim:custom'} disabled={!!busy}>
              Send payment
            </Button>
          </form>
        </details>

        <p className="mt-6 text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Screen state</p>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`demo-state-${p.id}`}
              aria-pressed={preset === p.id}
              onClick={() => choose(p.id)}
              className={`press min-h-11 cursor-pointer rounded-full px-2 py-2.5 text-[14px] font-semibold ${
                preset === p.id ? 'bg-lime text-forest' : 'bg-soft text-ink hover:bg-line'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl bg-canvas px-4 py-3.5">
          <div>
            <p className="text-[15px] font-semibold">Next action fails</p>
            <p className="text-[13px] text-muted">Shows the error path without touching the backend.</p>
          </div>
          <Switch checked={failNext} onChange={setFailNext} label="Next action fails" />
        </div>

        {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">{error}</p>}

        <Button variant="secondary" size="lg" className="mt-5 w-full" onClick={onClose}>
          Done
        </Button>
        <a
          href="/simulator"
          target="_blank"
          rel="noreferrer"
          className="press mt-2 flex min-h-11 items-center justify-center rounded-full text-[15px] font-semibold text-accent"
        >
          Open the full simulator on another screen ↗
        </a>
        <p className="mt-4 text-center text-[13px] leading-relaxed text-muted">
          Test payments really reach the local FastAPI backend. Do not run this prototype in public.
        </p>
      </div>
    </Sheet>
  )
}
