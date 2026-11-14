import { useCallback, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Transaction } from '../api/client'
import { formatDate, formatMoney, formatRate } from '../lib/money'
import { showsBreakdown } from '../lib/breakdown'
import { isCustomRate, regimeRule } from '../lib/taxjar'
import { tagFor } from '../lib/why'
import { useStore } from '../state/store'
import { TaxBreakdown } from './TaxBreakdown'
import { Avatar, Button, CircleButton, CloseIcon, Sheet } from './ui'
import { WorkChoice } from './WorkChoice'

type StepState = 'done' | 'waiting' | 'skipped'
interface Step {
  title: string
  detail: ReactNode
  state: StepState
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/**
 * /transactions/:id — one payment, and how Tax Jar handled it, as a short timeline:
 * it arrived, we checked it (and why), tax was set aside (or not), and where the money is now.
 * Opens as a sheet over the screen it came from; closing goes back there.
 */
export function TransactionSheet() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/activity'
  const close = useCallback(() => nav(from), [nav, from])
  const { transactions, screen } = useStore()
  const tx = transactions.find((t) => t.id === id)

  return (
    <Sheet label={tx ? `Payment ${tx.direction === 'in' ? 'from' : 'to'} ${tx.counterparty.name}` : 'Payment'} onClose={close} className="h-[92%]">
      <div className="flex items-center justify-between px-5 pt-2 pb-1">
        <span className="text-[13px] font-semibold text-muted">{tx ? (tx.direction === 'in' ? 'Payment received' : 'Payment sent') : 'Payment'}</span>
        <CircleButton label="Close" onClick={close}>
          <CloseIcon className="size-5" />
        </CircleButton>
      </div>
      {tx ? (
        <Body key={tx.id} tx={tx} />
      ) : (
        <div className="px-6 py-16 text-center">
          <p className="text-[17px] font-bold">{screen === 'loading' ? 'Loading…' : 'We can’t find that payment'}</p>
          {screen !== 'loading' && <p className="mt-1.5 text-[15px] text-muted">It may have been removed when the demo was reset.</p>}
        </div>
      )}
    </Sheet>
  )
}

function Body({ tx }: { tx: Transaction }) {
  const { profile, countries, undo, markIncome, answer, busy } = useStore()
  const [error, setError] = useState<string | null>(null)
  const r = tx.reservation
  const tag = tagFor(tx, profile.enabled)
  const signed = tx.direction === 'in' ? tx.amount : -tx.amount
  const label = tx.classification.label
  const sure = Math.round(tx.classification.confidence * 100)
  const rule = regimeRule(countries, profile.country, profile.regime)
  const showBreakdown = !!r && showsBreakdown(tx, isCustomRate(countries, profile.country, profile.regime, r.rate))
  const run = (p: Promise<unknown>) => {
    setError(null)
    p.catch((e: Error) => setError(e.message))
  }

  const steps: Step[] = []
  if (tx.direction === 'out') {
    steps.push({ title: `Sent ${time(tx.createdAt)}`, detail: `${formatMoney(tx.amount, tx.currency, { cents: true })} left your ${tx.currency} balance.`, state: 'done' })
    if (tx.reference === 'Tax payment') steps.push({ title: 'Paid from your Tax Jar', detail: 'Everything that was set aside went to the tax authority.', state: 'done' })
    else steps.push({ title: 'Nothing to set aside', detail: 'Money you spend is never taxed here.', state: 'skipped' })
  } else {
    steps.push({ title: `Arrived ${time(tx.createdAt)}`, detail: `${formatMoney(tx.amount, tx.currency, { cents: true })} into your ${tx.currency} balance.`, state: 'done' })
    steps.push({
      title: label === 'income' ? 'Recognised as work income' : label === 'personal' ? 'Recognised as personal' : 'Not sure if this is for work',
      detail: (
        <>
          {tx.classification.reasons.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {tx.classification.reasons.map((reason) => (
                <span key={reason} className="rounded-full bg-soft px-2.5 py-1 text-[13px] font-medium text-ink">
                  {reason}
                </span>
              ))}
            </span>
          )}
          {label !== 'unknown' && sure > 0 && sure < 100 && <span className="mt-1.5 block">{sure}% sure.</span>}
        </>
      ),
      state: label === 'unknown' ? 'waiting' : 'done',
    })
    if (r) {
      steps.push({
        title: `${formatRate(r.rate)} set aside for tax`,
        detail:
          r.sourceCurrency !== r.taxCurrency
            ? `${formatMoney(r.sourceAmount, r.sourceCurrency, { cents: true })} from your ${r.sourceCurrency} balance, converted to ${formatMoney(r.reservedAmount, r.taxCurrency, { cents: true })}.`
            : `${formatMoney(r.sourceAmount, r.sourceCurrency, { cents: true })} from your ${r.sourceCurrency} balance.`,
        state: 'done',
      })
      steps.push(
        r.status === 'reserved'
          ? { title: 'In your Tax Jar', detail: 'Waiting there until the tax is due.', state: 'done' }
          : r.status === 'paid'
            ? { title: 'Paid to the tax authority', detail: 'Done. Nothing more to do for this payment.', state: 'done' }
            : { title: 'Undone', detail: `${formatMoney(r.sourceAmount, r.sourceCurrency, { cents: true })} went back to your ${r.sourceCurrency} balance.`, state: 'done' },
      )
    } else if (label === 'unknown') {
      steps.push({
        title: profile.enabled ? 'Waiting for your answer' : 'Waiting for your Tax Jar',
        detail: profile.enabled
          ? `If it’s for work, ${formatRate(profile.rate)} (${formatMoney(Math.round((tx.amount * profile.rate) / 10_000), tx.currency)}) goes to your Tax Jar.`
          : 'Set up your Tax Jar to decide what happens with payments like this.',
        state: 'waiting',
      })
    } else if (label === 'income') {
      steps.push({ title: 'Arrived before your Tax Jar', detail: 'You can catch up on income like this from Home.', state: 'skipped' })
    } else {
      steps.push({ title: 'Left untouched', detail: 'Personal money is never taxed here.', state: 'skipped' })
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
      <div className="flex items-center gap-3.5 pt-2">
        <Avatar who={tx.counterparty} size={52} />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold">{tx.counterparty.name}</p>
          <p className="truncate text-[14px] text-muted">
            {formatDate(tx.createdAt, true)} · {tx.reference || 'No reference'}
          </p>
        </div>
      </div>
      <p className="money mt-4 text-[40px] leading-none font-extrabold tracking-[-0.05em]">{formatMoney(signed, tx.currency, { sign: true, cents: true })}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Verdict tx={tx} tag={tag} />
        {tx.counterparty.isKnownClient && <span className="rounded-full bg-soft px-2.5 py-1 text-[13px] font-semibold text-muted">Known client</span>}
      </div>

      <h2 className="mt-7 text-[13px] font-bold tracking-[0.06em] text-muted uppercase">How Tax Jar handled it</h2>
      <ol className="mt-3">
        {steps.map((step, i) => (
          <li key={step.title} className="relative flex gap-3.5 pb-5 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden="true" className="absolute top-8 bottom-0 left-[13px] w-0.5 bg-line" />}
            <span
              aria-hidden="true"
              className={`relative grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                step.state === 'done' ? 'bg-forest text-lime' : step.state === 'waiting' ? 'bg-amber text-forest' : 'bg-soft text-muted'
              }`}
            >
              {step.state === 'done' ? '✓' : step.state === 'waiting' ? '?' : '–'}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[15px] font-semibold">{step.title}</p>
              <div className="mt-0.5 text-[14px] leading-relaxed text-muted">{step.detail}</div>
            </div>
          </li>
        ))}
      </ol>

      {r && r.status !== 'undone' && showBreakdown && (
        <div className="mt-6">
          <TaxBreakdown tx={tx} rule={rule} />
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">{error}</p>}

      <div className="mt-6 space-y-2.5">
        {tag === 'Needs your answer' && (
          <WorkChoice
            amount={tx.amount}
            currency={tx.currency}
            rate={profile.rate}
            busy={busy === `answer:${tx.id}:true` ? true : busy === `answer:${tx.id}:false` ? false : null}
            disabled={!!busy}
            onChoose={(yes) => run(answer(tx.id, yes))}
          />
        )}
        {tx.direction === 'in' && label === 'personal' && profile.enabled && (
          <>
            <Button size="lg" className="w-full" loading={busy === `income:${tx.id}`} disabled={!!busy} onClick={() => run(markIncome(tx.id))}>
              Mark as work income instead
            </Button>
            <p className="text-center text-[13px] leading-relaxed text-muted">
              Tax: {formatMoney(Math.round((tx.amount * profile.rate) / 10_000), tx.currency, { cents: true })} ({formatRate(profile.rate)}) goes from your {tx.currency} balance to your Tax Jar.
            </p>
          </>
        )}
        {r?.status === 'reserved' && (
          <>
            <Button variant="danger" size="lg" className="w-full" loading={busy === `undo:${tx.id}`} onClick={() => run(undo(tx.id))}>
              Mark as personal instead
            </Button>
            <p className="text-center text-[13px] leading-relaxed text-muted">
              No tax is taken from this payment: {formatMoney(r.sourceAmount, r.sourceCurrency, { cents: true })} goes back to your {r.sourceCurrency} balance.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The one-glance answer to "is this taxed?", in the same two colours everywhere:
 * green = work income, tax set aside; grey = personal, no tax. Says who decided it.
 */
function Verdict({ tx, tag }: { tx: Transaction; tag: ReturnType<typeof tagFor> }) {
  if (tx.direction === 'out') return null
  const r = tx.reservation
  const you = tx.classification.reasons.some((x) => /^you\b/i.test(x)) || tx.classification.confidence >= 0.99
  const by = you ? 'You decided this' : 'Decided automatically'
  const v =
    r?.status === 'paid'
      ? { tone: 'bg-lime-soft text-accent', mark: '✓', title: 'Work income · tax paid', note: by }
      : r?.status === 'reserved'
        ? { tone: 'bg-lime-soft text-accent', mark: '✓', title: 'Work income · tax set aside', note: by }
        : tag === 'Needs your answer'
          ? { tone: 'bg-amber-soft text-amber-ink', mark: '?', title: 'Waiting for your answer', note: 'Work income or personal?' }
          : tag === 'Income'
            ? { tone: 'bg-sky/30 text-accent', mark: '✓', title: 'Work income · not taxed yet', note: 'Arrived before your Tax Jar' }
            : r?.status === 'undone'
              ? { tone: 'bg-soft text-ink', mark: '–', title: 'Personal · no tax taken', note: 'You took the tax back' }
              : { tone: 'bg-soft text-ink', mark: '–', title: 'Personal · no tax taken', note: by }
  return (
    <span className={`flex items-center gap-2.5 rounded-2xl px-3.5 py-2 ${v.tone}`}>
      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-ink/10 text-[14px] font-bold">{v.mark}</span>
      <span>
        <span className="block text-[15px] leading-tight font-bold">{v.title}</span>
        <span className="block text-[13px] leading-tight opacity-75">{v.note}</span>
      </span>
    </span>
  )
}
