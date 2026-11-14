import { useEffect, useState } from 'react'
import type { Transaction } from '../api/client'
import { useStore } from '../state/store'
import { linesSummary, paymentLines } from '../lib/breakdown'
import { formatMoney } from '../lib/money'
import { regimeRule } from '../lib/taxjar'
import { whyLine } from '../lib/why'
import {
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

export function StatusPill({ status }: { status: 'reserved' | 'undone' | 'paid' }) {
  const s = {
    reserved: ['Set aside', 'bg-forest text-lime'],
    paid: ['Paid', 'bg-forest text-white'],
    undone: ['Undone', 'bg-white/60 text-muted'],
  }[status]
  return <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${s[1]}`}>{s[0]}</span>
}
