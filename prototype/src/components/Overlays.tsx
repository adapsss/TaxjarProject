import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { tagFor } from '../data/engine'
import { useStore } from '../data/store'
import { formatDate, formatMoney, formatRate, partsLine, whyLine } from '../lib/money'
import {
  Avatar,
  Button,
  CheckIcon,
  CircleButton,
  CloseIcon,
  InfoIcon,
  JarIcon,
  Sheet,
  Spinner,
  Tag,
} from './ui'

const TOAST_MS = 6000

/** "€276 set aside for taxes" + why + Undo, floating above the tab bar. */
export function TaxToast() {
  const { toast, db, undo, busy, dismissToast } = useStore()
  const [error, setError] = useState<string | null>(null)
  const tx = toast ? db.transactions.find((t) => t.id === toast.txId) : null

  useEffect(() => {
    setError(null)
    if (!toast) return
    const id = setTimeout(dismissToast, TOAST_MS)
    return () => clearTimeout(id)
  }, [toast, dismissToast])

  if (!toast || !tx?.reservation) return null
  const r = tx.reservation
  return (
    <div
      className="pointer-events-none absolute inset-x-4 z-40 flex justify-center"
      style={{ bottom: 'calc(var(--tab-offset, 90px) + 10px)' }}
    >
      <div
        key={toast.key}
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full animate-rise overflow-hidden rounded-[24px] bg-forest text-white shadow-[0_18px_50px_-12px_rgba(16,40,8,0.55)]"
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lime text-forest">
              <JarIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-snug font-bold">
                <span className="money text-lime">{formatMoney(r.reservedAmount, r.taxCurrency)}</span> set aside for taxes
              </p>
              {r.breakdown && r.breakdown.length > 0 && (
                <p className="money mt-0.5 text-[11.5px] font-semibold text-white/80">{partsLine(r.breakdown, r.taxCurrency)}</p>
              )}
            </div>
            <CircleButton
              label="Dismiss"
              size={30}
              className="-mt-1 -mr-1 bg-transparent text-white/55 hover:bg-white/10 hover:text-white"
              onClick={dismissToast}
            >
              <CloseIcon className="size-4" />
            </CircleButton>
          </div>
          <div className="mt-2 flex items-end justify-between gap-3 pl-[52px]">
            <div className="min-w-0">
              <p className="text-[11.5px] leading-snug text-white/60">{whyLine(tx.classification.reasons)}</p>
              {error && <p className="mt-1 text-[11.5px] text-[#ffb4ab]">{error}</p>}
            </div>
            {tx.reservation.status === 'reserved' ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 shrink-0 px-2 text-[12px] text-lime hover:bg-white/10"
                loading={busy === `undo:${tx.id}`}
                onClick={() => undo(tx.id).catch((e: Error) => setError(e.message))}
              >
                Undo
              </Button>
            ) : (
              <Spinner className="mb-1.5 text-lime" />
            )}
          </div>
        </div>
        <div className="h-[3px] bg-white/10">
          <div className="h-full origin-left animate-shrink bg-lime" style={{ animationDuration: `${TOAST_MS}ms` }} />
        </div>
      </div>
    </div>
  )
}

/** "Is this payment for work?" for the classifier's middle band. */
export function WorkQuestionDialog() {
  const { question, db, answer, busy, closeQuestion } = useStore()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setError(null), [question])
  const tx = question ? db.transactions.find((t) => t.id === question) : null
  if (!tx) return null

  const go = (yes: boolean) => answer(tx.id, yes).catch((e: Error) => setError(e.message))
  const inFlight = busy?.startsWith(`answer:${tx.id}`)

  return (
    <div className="absolute inset-0 z-[70] grid animate-fade place-items-center bg-forest/45 px-4 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-labelledby="q-title" className="alert-panel">
        <div className="flex items-center gap-3">
          <Avatar who={tx.counterparty} size={46} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{tx.counterparty.name}</p>
            <p className="truncate text-[12px] text-muted">{tx.reference || 'No reference'}</p>
          </div>
          <span className="money text-[20px] font-extrabold tracking-[-0.04em]">{formatMoney(tx.amount, tx.currency, { sign: true })}</span>
        </div>
        <h2 id="q-title" className="mt-5 text-[26px] leading-[1.06] font-extrabold tracking-[-0.04em]">
          Is this payment for work?
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          If it is, we’ll set aside {formatRate(db.profile.rate)} ({formatMoney(Math.round((tx.amount * db.profile.rate) / 10_000), tx.currency)}) for
          taxes. We’ll remember your answer for {tx.counterparty.name.split(' ')[0]} next time.
        </p>
        {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">{error}</p>}
        <div className="mt-5 space-y-2">
          <Button size="lg" className="w-full" loading={busy === `answer:${tx.id}:true`} disabled={inFlight} onClick={() => go(true)}>
            Yes, it’s for work
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="w-full"
            loading={busy === `answer:${tx.id}:false`}
            disabled={inFlight}
            onClick={() => go(false)}
          >
            No, it’s personal
          </Button>
        </div>
        <button
          type="button"
          onClick={closeQuestion}
          className="press mx-auto mt-3 block cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-semibold text-muted hover:text-ink"
        >
          Decide later
        </button>
      </div>
    </div>
  )
}

/** Bottom sheet for one payment: amount, why, and the reservation breakdown. */
export function ReservationDrawer() {
  const [params, setParams] = useSearchParams()
  const { db, undo, busy, openQuestion } = useStore()
  const [error, setError] = useState<string | null>(null)
  const id = params.get('tx')
  useEffect(() => setError(null), [id])
  const tx = id ? db.transactions.find((t) => t.id === id) : null
  if (!tx) return null

  const close = () => setParams((p) => (p.delete('tx'), p))
  const r = tx.reservation
  const tag = tagFor(tx, db.profile.enabled)
  const signed = tx.direction === 'in' ? tx.amount : -tx.amount

  return (
    <Sheet label="Payment details" onClose={close} className="h-[90%]">
      <div className="flex items-center justify-between px-5 pt-3 pb-1">
        <span className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
          {tx.direction === 'in' ? 'Payment received' : 'Payment sent'}
        </span>
        <CircleButton label="Close" size={36} onClick={close}>
          <CloseIcon className="size-4" />
        </CircleButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <div className="pt-2">
          <Avatar who={tx.counterparty} size={54} />
          <p className="money mt-3 text-[40px] leading-none font-extrabold tracking-[-0.05em]">
            {formatMoney(signed, tx.currency, { sign: true, cents: true })}
          </p>
          <p className="mt-1.5 text-[13px] text-muted">
            {tx.direction === 'in' ? 'from' : 'to'} <span className="font-semibold text-ink">{tx.counterparty.name}</span> ·{' '}
            {formatDate(tx.createdAt, true)}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {tag && <Tag name={tag} />}
            {tx.counterparty.isKnownClient && (
              <span className="rounded-full bg-soft px-2.5 py-1 text-[11.5px] font-semibold text-muted">Known client</span>
            )}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl bg-canvas">
          <Row k="Reference" v={tx.reference || '—'} />
          {tx.classification.reasons.length > 0 && <Row k="Why" v={tx.classification.reasons.join(' · ')} last />}
        </div>

        {r && (
          <div className="mt-4 rounded-[22px] bg-lime-soft p-4 text-forest">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] font-bold">
                <JarIcon className="size-4" /> Tax Jar
              </span>
              <StatusPill status={r.status} />
            </div>
            <dl className="space-y-2.5 text-[13px]">
              <Line k="Received" v={formatMoney(tx.amount, tx.currency, { cents: true })} />
              <Line k="Tax rate" v={formatRate(r.rate)} />
              <Line k={`Taken from ${tx.currency} balance`} v={formatMoney(r.sourceAmount, r.sourceCurrency, { cents: true })} />
              {r.sourceCurrency !== r.taxCurrency && <Line k="Exchange rate" v={`1 ${r.sourceCurrency} = ${r.fxRate} ${r.taxCurrency}`} />}
              <div className="border-t border-forest/10 pt-2.5">
                <Line
                  k={r.status === 'undone' ? 'Returned to balance' : r.status === 'paid' ? 'Paid to tax authority' : 'In your Tax Jar'}
                  v={formatMoney(r.reservedAmount, r.taxCurrency, { cents: true })}
                  strong
                />
              </div>
              {r.status !== 'undone' && r.breakdown && r.breakdown.length > 0 && (
                <div className="space-y-2 border-t border-forest/10 pt-2.5">
                  <p className="text-[10.5px] font-bold tracking-[0.08em] text-forest/55 uppercase">Of which</p>
                  {r.breakdown.map((part) => (
                    <Line key={part.id} k={part.name} v={formatMoney(part.amount, r.taxCurrency, { cents: true })} />
                  ))}
                </div>
              )}
            </dl>
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">{error}</p>}

        <div className="mt-5 space-y-2.5">
          {r?.status === 'reserved' && (
            <Button
              variant="danger"
              size="lg"
              className="w-full"
              loading={busy === `undo:${tx.id}`}
              onClick={() => undo(tx.id).catch((e: Error) => setError(e.message))}
            >
              This wasn’t income
            </Button>
          )}
          {r?.status === 'reserved' && (
            <p className="text-center text-[12px] text-muted">
              {formatMoney(r.sourceAmount, r.sourceCurrency, { cents: true })} goes back to your {r.sourceCurrency} balance.
            </p>
          )}
          {r?.status === 'paid' && (
            <p className="flex items-start gap-2 rounded-2xl bg-canvas px-4 py-3 text-[12.5px] text-muted">
              <InfoIcon className="mt-0.5 size-4 shrink-0" /> This tax has already been paid, so it can’t be undone.
            </p>
          )}
          {r?.status === 'undone' && (
            <p className="flex items-start gap-2 rounded-2xl bg-canvas px-4 py-3 text-[12.5px] text-muted">
              <InfoIcon className="mt-0.5 size-4 shrink-0" /> Undone. The money is back in your {r.sourceCurrency} balance.
            </p>
          )}
          {tag === 'Needs your answer' && (
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                close()
                openQuestion(tx.id)
              }}
            >
              <CheckIcon className="size-4" /> Is this payment for work? Answer
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div className={`flex gap-3 px-4 py-3 ${last ? '' : 'border-b border-line/70'}`}>
      <dt className="w-[74px] shrink-0 text-[12px] text-muted">{k}</dt>
      <dd className="min-w-0 text-[12.5px] font-medium">{v}</dd>
    </div>
  )
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? 'font-semibold' : 'text-forest/65'}>{k}</dt>
      <dd className={`money ${strong ? 'text-[16px] font-extrabold' : 'font-semibold'}`}>{v}</dd>
    </div>
  )
}

export function StatusPill({ status }: { status: 'reserved' | 'undone' | 'paid' }) {
  const s = {
    reserved: ['Set aside', 'bg-forest text-lime'],
    paid: ['Paid', 'bg-forest text-white'],
    undone: ['Undone', 'bg-white/60 text-muted'],
  }[status]
  return <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${s[1]}`}>{s[0]}</span>
}
