import { useState } from 'react'
import { formatMoney, formatRate } from '../lib/money'
import { useScenarios, type Scenario } from '../state/scenarios'
import { useStore } from '../state/store'
import { Spinner } from './ui'

const HIDE_KEY = 'taxjar.howItWorks.closed'
const readClosed = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

/** The three things that can happen to a payment, each tied to one of role D's demo payments. */
const CASES = [
  { id: 'acme', mark: '✓', tone: 'bg-forest text-lime', title: 'A client pays you', result: (rate: string) => `We set ${rate} aside for tax, automatically.` },
  { id: 'mari', mark: '–', tone: 'bg-soft text-muted', title: 'A friend sends you money', result: () => 'Left untouched. Personal money is never taxed.' },
  { id: 'john', mark: '?', tone: 'bg-amber text-forest', title: 'We’re not sure', result: () => 'We ask you once, then remember the answer.' },
]

/**
 * "How Tax Jar treats payments": the product explained by doing. Each case has a Try button
 * that sends that test payment through the real pipeline, so the row arrives in the list below,
 * and tapping it shows every step. The Try buttons are demo-only and labelled so.
 */
export function HowItWorks() {
  const { profile, simulate, busy } = useStore()
  const { scenarios } = useScenarios()
  const [closed, setClosed] = useState(readClosed)
  const [error, setError] = useState<string | null>(null)

  const toggle = () => {
    const next = !closed
    setClosed(next)
    try {
      localStorage.setItem(HIDE_KEY, next ? '1' : '0')
    } catch {
      // Private mode: the choice just lasts for this visit.
    }
  }
  const send = (s: Scenario) => {
    setError(null)
    simulate(s, `sim:${s.id}`).catch((e: Error) => setError(e.message))
  }

  return (
    <section aria-labelledby="how-title" className="rounded-[24px] bg-surface">
      <button
        type="button"
        aria-expanded={!closed}
        aria-controls="how-body"
        onClick={toggle}
        className="press flex min-h-[56px] w-full cursor-pointer items-center justify-between gap-3 rounded-[24px] px-4 py-3 text-left"
      >
        <span id="how-title" className="text-[17px] font-extrabold tracking-[-0.02em]">
          How Tax Jar treats payments
        </span>
        <svg viewBox="0 0 24 24" className={`size-5 shrink-0 text-muted transition-transform ${closed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {!closed && (
        <div id="how-body" className="px-4 pb-4">
          <ul>
            {CASES.map((c) => {
              const s = scenarios.find((x) => x.id === c.id)
              return (
                <li key={c.id} className="flex items-center gap-3 border-t border-line/70 py-3">
                  <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full text-[14px] font-bold ${c.tone}`}>
                    {c.mark}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{c.title}</p>
                    <p className="text-[14px] leading-snug text-muted">{c.result(formatRate(profile.rate))}</p>
                  </div>
                  {s && (
                    <button
                      type="button"
                      data-testid={`try-${c.id}`}
                      disabled={!!busy}
                      onClick={() => send(s)}
                      aria-label={`Try it: ${s.senderName} sends ${formatMoney(s.amount, s.currency)}`}
                      className="press flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-lime-soft px-3.5 text-[14px] font-semibold text-accent disabled:cursor-wait disabled:opacity-50"
                    >
                      {busy === `sim:${s.id}` ? <Spinner className="size-3.5" /> : null}
                      Try {formatMoney(s.amount, s.currency)}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {error && <p role="alert" className="mt-1 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">{error}</p>}
          <p className="border-t border-line/70 pt-3 text-[13px] leading-relaxed text-muted">
            {profile.enabled
              ? 'Try sends a test payment (demo only). It lands in the list below: tap it to see each step and the exact tax.'
              : 'Your Tax Jar isn’t set up yet, so test payments arrive but nothing is set aside or asked. Set it up in Settings first.'}
          </p>
        </div>
      )}
    </section>
  )
}
