import { useEffect, useRef, useState } from 'react'
import type { Transaction } from '../api/client'
import { useEscape } from '../lib/useEscape'
import { WorkChoice } from './WorkChoice'
import { useStore } from '../state/store'
import { linesSummary, paymentLines } from '../lib/breakdown'
import { formatMoney } from '../lib/money'
import { regimeRule } from '../lib/taxjar'
import { whyLine } from '../lib/why'
import {
  Avatar,
  Button,
  CircleButton,
  CloseIcon,
  JarIcon,
  Spinner,
} from './ui'

const TOAST_MS = 6000

/** "€276 set aside for taxes" + why + Undo, floating above the tab bar. */
export function TaxToast() {
  const { toast, transactions } = useStore()
  const tx = toast ? transactions.find((t) => t.id === toast.txId) : null
  if (!toast || !tx?.reservation) return null
  // Keyed per toast, so a new reservation restarts the timer and clears any old error.
  return <ToastCard key={toast.key} tx={tx} />
}

function ToastCard({ tx }: { tx: Transaction }) {
  const { undo, busy, dismissToast, profile, countries } = useStore()
  const rule = regimeRule(countries, profile.country, profile.regime)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(dismissToast, TOAST_MS)
    return () => clearTimeout(id)
  }, [dismissToast])

  const r = tx.reservation
  if (!r) return null
  return (
    <div
      className="pointer-events-none absolute inset-x-4 z-40 flex justify-center"
      style={{ bottom: 'calc(var(--tab-offset, 90px) + 10px)' }}
    >
      <div
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
              <p className="text-[15px] leading-snug font-bold">
                <span className="money text-lime">{formatMoney(r.reservedAmount, r.taxCurrency)}</span> set aside for taxes
              </p>
              <p className="money mt-0.5 text-[13px] font-semibold text-white/80">{linesSummary(paymentLines(tx, rule), r.taxCurrency)}</p>
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
              <p className="text-[13px] leading-snug text-white/60">{whyLine(tx.classification.reasons)}</p>
              {error && <p className="mt-1 text-[13px] text-[#ffb4ab]">{error}</p>}
            </div>
            {r.status === 'reserved' ? (
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 px-3 text-lime hover:bg-white/10"
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

/** A one-off message above the tab bar, e.g. "€1,110.80 set aside for earlier income". */
export function NoticeToast() {
  const { notice, dismissNotice, toast } = useStore()
  if (!notice || toast) return null
  return <NoticeCard key={notice.key} title={notice.title} detail={notice.detail} onDone={dismissNotice} />
}

function NoticeCard({ title, detail, onDone }: { title: string; detail: string; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, TOAST_MS)
    return () => clearTimeout(id)
  }, [onDone])
  return (
    <div className="pointer-events-none absolute inset-x-4 z-40 flex justify-center" style={{ bottom: 'calc(var(--tab-offset, 90px) + 10px)' }}>
      <div role="status" aria-live="polite" className="pointer-events-auto flex w-full animate-rise items-start gap-3 rounded-[24px] bg-forest p-4 text-white shadow-[0_18px_50px_-12px_rgba(16,40,8,0.55)]">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lime text-forest">
          <JarIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] leading-snug font-bold">{title}</p>
          <p className="mt-0.5 text-[14px] text-white/75">{detail}</p>
        </div>
        <CircleButton label="Dismiss" className="-mt-1 -mr-1 bg-transparent text-white/60 hover:bg-white/10 hover:text-white" onClick={onDone}>
          <CloseIcon className="size-4" />
        </CircleButton>
      </div>
    </div>
  )
}

/** "Is this payment for work?" for the classifier's middle band. */
export function WorkQuestionDialog() {
  const { question, transactions } = useStore()
  const tx = question ? transactions.find((t) => t.id === question) : null
  if (!tx) return null
  // Keyed per payment, so a new question starts clean.
  return <QuestionCard key={tx.id} tx={tx} />
}

function QuestionCard({ tx }: { tx: Transaction }) {
  const { profile, answer, busy, closeQuestion } = useStore()
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useEscape(closeQuestion)
  // Move keyboard focus to the card, so Tab reaches Yes / No first and a screen reader announces it.
  useEffect(() => dialog.current?.focus(), [])

  const go = (yes: boolean) => answer(tx.id, yes).catch((e: Error) => setError(e.message))
  const inFlight = busy?.startsWith(`answer:${tx.id}`)

  return (
    <div className="pointer-events-none absolute inset-x-3 z-[55]" style={{ bottom: 'calc(var(--tab-offset, 90px) + 8px)' }}>
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="false"
        aria-labelledby="q-title"
        className="pointer-events-auto animate-rise rounded-[28px] bg-white p-5 shadow-[0_24px_60px_-12px_rgba(14,15,12,0.5)] ring-2 ring-amber outline-none"
      >
        <div className="flex items-center gap-3">
          <Avatar who={tx.counterparty} size={46} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{tx.counterparty.name}</p>
            <p className="truncate text-[13px] text-muted">{tx.reference || 'No reference'}</p>
          </div>
          <span className="money text-[20px] font-extrabold tracking-[-0.04em]">{formatMoney(tx.amount, tx.currency, { sign: true })}</span>
        </div>
        <h2 id="q-title" className="mt-4 text-[24px] leading-[1.06] font-extrabold tracking-[-0.04em]">
          Is this payment for work?
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
          Pick one. We’ll remember it for {tx.counterparty.name.split(' ')[0]} next time.
        </p>
        {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">{error}</p>}
        <div className="mt-4">
          <WorkChoice
            amount={tx.amount}
            currency={tx.currency}
            rate={profile.rate}
            busy={busy === `answer:${tx.id}:true` ? true : busy === `answer:${tx.id}:false` ? false : null}
            disabled={!!inFlight}
            onChoose={go}
          />
        </div>
        <button
          type="button"
          onClick={closeQuestion}
          className="press mx-auto mt-3 block cursor-pointer rounded-full px-3 py-1.5 text-[14px] font-semibold text-muted hover:text-ink"
        >
          Decide later
        </button>
      </div>
    </div>
  )
}



export function StatusPill({ status }: { status: 'reserved' | 'undone' | 'paid' }) {
  const s = {
    reserved: ['Set aside', 'bg-forest text-lime'],
    paid: ['Paid', 'bg-forest text-white'],
    undone: ['Undone', 'bg-white/60 text-muted'],
  }[status]
  return <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${s[1]}`}>{s[0]}</span>
}
