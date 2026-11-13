import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { tagFor } from '../lib/why'
import type { Transaction } from '../api/client'
import { formatMoney, relativeDay } from '../lib/money'
import { Avatar, Tag } from './ui'

const FRESH_MS = 5000

export function TransactionRow({ tx, enabled, last }: { tx: Transaction; enabled: boolean; last?: boolean }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const tag = tagFor(tx, enabled)
  // Decided once, when the row first appears: only a payment that just arrived animates in.
  const [fresh] = useState(() => Date.now() - new Date(tx.createdAt).getTime() < FRESH_MS)
  const r = tx.reservation
  const signed = tx.direction === 'in' ? tx.amount : -tx.amount

  return (
    <button
      type="button"
      data-tx-id={tx.id}
      onClick={() => nav(`/transactions/${tx.id}`, { state: { from: pathname } })}
      className={`press flex min-h-[68px] w-full cursor-pointer items-center gap-3.5 px-4 py-3 text-left hover:bg-canvas ${
        last ? '' : 'border-b border-line/70'
      } ${fresh ? 'animate-arrive' : ''}`}
    >
      <Avatar who={tx.counterparty} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-semibold tracking-[-0.01em]">{tx.counterparty.name}</div>
        <div className="mt-0.5 truncate text-[12px] text-muted">
          {relativeDay(tx.createdAt)} · {tx.reference || 'No reference'}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={`money text-[14.5px] font-semibold ${tx.direction === 'in' ? 'text-ink' : 'text-ink/65'}`}>
          {formatMoney(signed, tx.currency, { sign: true, cents: true })}
        </span>
        {tag && (
          <Tag name={tag}>
            {tag === 'Tax set aside' && r
              ? `${formatMoney(r.reservedAmount, r.taxCurrency)} tax`
              : tag === 'Tax paid' && r
                ? `${formatMoney(r.reservedAmount, r.taxCurrency)} paid`
                : undefined}
          </Tag>
        )}
      </div>
    </button>
  )
}
