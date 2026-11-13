import { useEffect, useRef, useState } from 'react'
import type { Transaction } from '../api/client'
import { formatDate, formatMoney, formatRate, partsLine } from '../lib/money'
import { useEscape } from '../lib/useEscape'
import { tagFor, whyLine } from '../lib/why'
import { useStore } from '../state/store'
import { Avatar, Button, CloseIcon, InfoIcon, JarIcon, Tag } from './ui'

const TOAST_MS = 6000

/** "€276 set aside for taxes" + why + Undo. */
export function TaxToast() {
  const { toast, transactions } = useStore()
  const tx = toast ? transactions.find((t) => t.id === toast.txId) : null
  if (!toast || !tx?.reservation) return null
  // Keyed per toast, so a new reservation restarts the timer and clears any old error.
  return <ToastCard key={toast.key} tx={tx} />
}

function ToastCard({ tx }: { tx: Transaction }) {
  const { undo, busy, dismissToast } = useStore()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(dismissToast, TOAST_MS)
    return () => clearTimeout(id)
  }, [dismissToast])

  const r = tx.reservation
  if (!r) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center pl-[212px] xl:pl-[248px]">
      <div role="status" className="pointer-events-auto w-[540px] animate-rise overflow-hidden rounded-2xl bg-forest text-white shadow-[0_18px_50px_-12px_rgba(16,40,8,0.55)]">
        <div className="flex items-start gap-3.5 p-4 pr-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime text-forest">
            <JarIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-bold">
              <span className="num text-lime">{formatMoney(r.reservedAmount, r.taxCurrency)}</span> set aside for taxes
            </p>
            {r.breakdown && r.breakdown.length > 0 && (
              <p className="num mt-0.5 text-[13px] font-semibold text-white/85">{partsLine(r.breakdown, r.taxCurrency)}</p>
            )}
            <p className="mt-0.5 text-[13px] text-white/65">{whyLine(tx.classification.reasons)}</p>
            {error && <p className="mt-1 text-[12.5px] text-[#ffb4ab]">{error}</p>}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-lime hover:bg-white/10"
            loading={busy === `undo:${tx.id}`}
            onClick={() => undo(tx.id).catch((e: Error) => setError(e.message))}
          >
            Undo
          </Button>
          <button onClick={dismissToast} aria-label="Dismiss" className="grid size-8 cursor-pointer place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white">
            <CloseIcon className="size-4" />
          </button>
        </div>
        <div className="h-1 bg-white/10">
          <div className="h-full origin-left animate-shrink bg-lime" style={{ animationDuration: `${TOAST_MS}ms` }} />
        </div>
      </div>
    </div>
  )
}

/** "Is this payment for work?" for the classifier's middle band (0.4–0.8). */
export function WorkQuestionDialog() {
  const { question, transactions } = useStore()
  const tx = question ? transactions.find((t) => t.id === question) : null
  if (!tx) return null
  return <QuestionCard key={tx.id} tx={tx} />
}

function QuestionCard({ tx }: { tx: Transaction }) {
  const { profile, answer, busy, closeQuestion } = useStore()
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useEscape(closeQuestion)
  // Move keyboard focus into the dialog, so Tab reaches Yes / No first and a screen reader announces it.
  useEffect(() => dialog.current?.focus(), [])

  const go = (yes: boolean) => answer(tx.id, yes).catch((e: Error) => setError(e.message))
  const inFlight = busy?.startsWith(`answer:${tx.id}`)

  return (
    <div className="fixed inset-0 z-50 grid animate-fade place-items-center bg-forest/40 backdrop-blur-[2px]">
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="q-title" className="w-[480px] outline-none animate-rise rounded-3xl bg-white p-7 shadow-2xl">
        <div className="flex items-center gap-3">
          <Avatar who={tx.counterparty} size={48} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{tx.counterparty.name}</p>
            <p className="truncate text-sm text-muted">{tx.reference || 'No reference'}</p>
          </div>
          <span className="num ml-auto text-[22px] font-extrabold">{formatMoney(tx.amount, tx.currency, { sign: true })}</span>
        </div>
        <h2 id="q-title" className="mt-6 text-[26px] leading-tight font-extrabold tracking-tight">
          Is this payment for work?
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          If it is, we’ll set aside {formatRate(profile.rate)} (
          {formatMoney(Math.round(((tx.amount * profile.rate) / 10_000)), tx.currency)}) for taxes. We’ll remember your answer for{' '}
          {tx.counterparty.name.split(' ')[0]} next time.
        </p>
        {error && <p className="mt-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>}
        <div className="mt-7 flex gap-2.5">
          <Button variant="secondary" size="lg" className="flex-1" loading={busy === `answer:${tx.id}:false`} disabled={inFlight} onClick={() => go(false)}>
            No, it’s personal
          </Button>
          <Button size="lg" className="flex-1" loading={busy === `answer:${tx.id}:true`} disabled={inFlight} onClick={() => go(true)}>
            Yes, it’s for work
          </Button>
        </div>
        <button onClick={closeQuestion} className="mx-auto mt-4 block cursor-pointer text-sm font-semibold text-muted hover:text-ink">
          Decide later
        </button>
      </div>
    </div>
  )
}

/** Side drawer for one transaction: amount, why, and the reservation breakdown. */
export function TransactionDrawer({ id, onClose: close }: { id: string; onClose: () => void }) {
  const { transactions, profile, screen, undo, busy, openQuestion } = useStore()
  const [error, setError] = useState<string | null>(null)
  useEscape(close)
  const tx = transactions.find((t) => t.id === id)
  if (!tx) {
    if (screen !== 'ready') return null
    return (
      <div className="fixed inset-0 z-50 flex animate-fade justify-end bg-forest/30" onClick={close}>
        <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-[460px] flex-col items-center justify-center bg-white px-10 text-center shadow-2xl">
          <p className="text-[20px] font-bold">We can’t find that payment</p>
          <p className="mt-1.5 text-[15px] text-muted">It may have been removed when the demo was reset.</p>
          <Button variant="secondary" className="mt-6" onClick={close}>
            Back
          </Button>
        </aside>
      </div>
    )
  }

  const r = tx.reservation
  const tag = tagFor(tx, profile.enabled)
  const signed = tx.direction === 'in' ? tx.amount : -tx.amount

  return (
    <div className="fixed inset-0 z-50 flex animate-fade justify-end bg-forest/30" onClick={close}>
      <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-[460px] animate-slide-in flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between px-7 pt-6">
          <span className="text-sm font-semibold text-muted">{tx.direction === 'in' ? 'Payment received' : 'Payment sent'}</span>
          <button onClick={close} aria-label="Close" className="grid size-9 cursor-pointer place-items-center rounded-full hover:bg-canvas">
            <CloseIcon className="size-5" />
          </button>
        </div>

        <div className="px-7 pt-5 pb-6">
          <Avatar who={tx.counterparty} size={56} />
          <p className="num mt-4 text-[40px] leading-none font-extrabold tracking-tight">{formatMoney(signed, tx.currency, { sign: true, cents: true })}</p>
          <p className="mt-2 text-[15px] text-muted">
            {tx.direction === 'in' ? 'from' : 'to'} <span className="font-semibold text-ink">{tx.counterparty.name}</span> · {formatDate(tx.createdAt, true)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {tag && <Tag name={tag} />}
            {tx.counterparty.isKnownClient && <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11.5px] font-semibold text-muted">Known client</span>}
          </div>
        </div>

        <dl className="mx-7 divide-y divide-line rounded-2xl border border-line text-[14px]">
          <Row k="Reference" v={tx.reference || '—'} />
          {tx.classification.reasons.length > 0 && <Row k="Why" v={tx.classification.reasons.join(' · ')} />}
        </dl>

        {r && (
          <div className="mx-7 mt-5 rounded-2xl bg-canvas p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-bold text-forest">
                <JarIcon className="size-4" /> Tax Jar
              </span>
              <StatusPill status={r.status} />
            </div>
            <dl className="space-y-2.5 text-[14px]">
              <Line k="Received" v={formatMoney(tx.amount, tx.currency, { cents: true })} />
              <Line k={`Tax rate`} v={formatRate(r.rate)} />
              <Line k={`Taken from ${tx.currency} balance`} v={formatMoney(r.sourceAmount, r.sourceCurrency, { cents: true })} />
              {r.sourceCurrency !== r.taxCurrency && <Line k="Exchange rate" v={`1 ${r.sourceCurrency} = ${r.fxRate} ${r.taxCurrency}`} />}
              <div className="border-t border-line pt-2.5">
                <Line k={r.status === 'undone' ? 'Returned to balance' : 'In your Tax Jar'} v={formatMoney(r.reservedAmount, r.taxCurrency, { cents: true })} strong />
              </div>
              {r.status !== 'undone' && r.breakdown && r.breakdown.length > 0 && (
                <div className="space-y-2 border-t border-line pt-2.5">
                  <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">Of which</p>
                  {r.breakdown.map((part) => (
                    <Line key={part.id} k={part.name} v={formatMoney(part.amount, r.taxCurrency, { cents: true })} />
                  ))}
                </div>
              )}
            </dl>
          </div>
        )}

        <div className="mt-auto px-7 pt-6 pb-7">
          {error && <p className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>}
          {r?.status === 'reserved' && (
            <Button variant="danger" size="lg" className="w-full" loading={busy === `undo:${tx.id}`} onClick={() => undo(tx.id).catch((e: Error) => setError(e.message))}>
              This wasn’t income
            </Button>
          )}
          {r?.status === 'reserved' && <p className="mt-2.5 text-center text-[13px] text-muted">{formatMoney(r.sourceAmount, r.sourceCurrency, { cents: true })} goes back to your {r.sourceCurrency} balance.</p>}
          {r?.status === 'paid' && (
            <p className="flex items-start gap-2 rounded-xl bg-canvas px-4 py-3 text-[13.5px] text-muted">
              <InfoIcon className="mt-0.5 size-4 shrink-0" /> This tax has already been paid, so it can’t be undone.
            </p>
          )}
          {r?.status === 'undone' && (
            <p className="flex items-start gap-2 rounded-xl bg-canvas px-4 py-3 text-[13.5px] text-muted">
              <InfoIcon className="mt-0.5 size-4 shrink-0" /> Undone. The money is back in your {r.sourceCurrency} balance.
            </p>
          )}
          {tag === 'Needs your answer' && (
            <Button size="lg" className="w-full" onClick={() => (close(), openQuestion(tx.id))}>
              Is this payment for work? Answer
            </Button>
          )}
        </div>
      </aside>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      <dt className="w-24 shrink-0 text-muted">{k}</dt>
      <dd className="min-w-0 font-medium">{v}</dd>
    </div>
  )
}
function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? 'font-semibold' : 'text-muted'}>{k}</dt>
      <dd className={`num ${strong ? 'text-[17px] font-extrabold' : 'font-semibold'}`}>{v}</dd>
    </div>
  )
}

export function StatusPill({ status }: { status: 'reserved' | 'undone' | 'paid' }) {
  const s = {
    reserved: ['Set aside', 'bg-lime text-forest'],
    paid: ['Paid', 'bg-forest text-white'],
    undone: ['Undone', 'bg-black/[0.07] text-muted'],
  }[status]
  return <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${s[1]}`}>{s[0]}</span>
}
