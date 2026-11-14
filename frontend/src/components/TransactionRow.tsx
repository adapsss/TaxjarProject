import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { tagFor } from '../lib/why'
import type { Transaction } from '../api/client'
import { formatMoney, relativeDay } from '../lib/money'
import { useStore } from '../state/store'
import { Avatar, Tag } from './ui'
import { WorkChoice } from './WorkChoice'

const FRESH_MS = 5000

export function TransactionRow({ tx, enabled, last }: { tx: Transaction; enabled: boolean; last?: boolean }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const tag = tagFor(tx, enabled)
  // Decided once, when the row first appears: only a payment that just arrived animates in.
  const [fresh] = useState(() => Date.now() - new Date(tx.createdAt).getTime() < FRESH_MS)
  const r = tx.reservation
  const signed = tx.direction === 'in' ? tx.amount : -tx.amount
  const { answer, busy, profile } = useStore()
  const [error, setError] = useState<string | null>(null)
  const asking = tag === 'Needs your answer'

  return (
    <div
      data-tx-id={tx.id}
      className={`${last ? '' : 'border-b border-line/70'} ${asking ? 'bg-amber-soft/50' : ''} ${fresh ? 'animate-arrive' : ''}`}
    >
      <button
        type="button"
        onClick={() => nav(`/transactions/${tx.id}`, { state: { from: pathname } })}
        className="press flex min-h-[68px] w-full cursor-pointer items-center gap-3.5 px-4 py-3 text-left hover:bg-canvas"
      >
        <Avatar who={tx.counterparty} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold tracking-[-0.01em]">{tx.counterparty.name}</div>
          <div className="mt-0.5 truncate text-[13px] text-muted">
            {relativeDay(tx.createdAt)} · {tx.reference || 'No reference'}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`money text-[16px] font-semibold ${tx.direction === 'in' ? 'text-ink' : 'text-ink/65'}`}>
            {formatMoney(signed, tx.currency, { sign: true, cents: true })}
          </span>
          {tag && !asking && (
            <Tag name={tag}>
              {tag === 'Tax set aside' && r
                ? `${formatMoney(r.reservedAmount, r.taxCurrency)} tax`
                : tag === 'Tax paid' && r
                  ? `${formatMoney(r.reservedAmount, r.taxCurrency)} paid`
                  : tag === 'Personal'
                    ? 'Personal · no tax'
                    : tag === 'Income'
                      ? 'Not taxed yet'
                      : undefined}
            </Tag>
          )}
        </div>
      </button>
      {asking && (
        <div className="px-4 pb-3.5">
          <p className="mb-2 text-[14px] font-semibold text-amber-ink">Is this payment for work?</p>
          <WorkChoice
            compact
            amount={tx.amount}
            currency={tx.currency}
            rate={profile.rate}
            busy={busy === `answer:${tx.id}:true` ? true : busy === `answer:${tx.id}:false` ? false : null}
            disabled={!!busy?.startsWith(`answer:${tx.id}`)}
            onChoose={(yes) => {
              setError(null)
              answer(tx.id, yes).catch((e: Error) => setError(e.message))
            }}
          />
          {error && <p role="alert" className="mt-2 rounded-2xl bg-danger-soft px-3.5 py-2 text-[13px] text-danger">{error}</p>}
        </div>
      )}
    </div>
  )
}
