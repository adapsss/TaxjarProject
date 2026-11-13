import { useSearchParams } from 'react-router-dom'
import { tagFor } from '../data/engine'
import type { Transaction } from '../data/types'
import { formatMoney, relativeDay } from '../lib/money'
import { Avatar, Tag } from './ui'

const FRESH_MS = 5000

export function TransactionRow({ tx, enabled }: { tx: Transaction; enabled: boolean }) {
  const [, setParams] = useSearchParams()
  const tag = tagFor(tx, enabled)
  const fresh = Date.now() - new Date(tx.createdAt).getTime() < FRESH_MS
  const r = tx.reservation
  const signed = tx.direction === 'in' ? tx.amount : -tx.amount

  return (
    <button
      onClick={() => setParams((p) => (p.set('tx', tx.id), p))}
      className={`flex min-h-[70px] w-full cursor-pointer items-center gap-3.5 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-canvas ${fresh ? 'animate-arrive' : ''}`}
    >
      <Avatar who={tx.counterparty} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{tx.counterparty.name}</div>
        <div className="truncate text-[13px] text-muted">
          {relativeDay(tx.createdAt)} · {tx.reference || 'No reference'}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={`num text-[15px] font-semibold ${tx.direction === 'in' ? 'text-ink' : 'text-ink/70'}`}>
          {formatMoney(signed, tx.currency, { sign: true, cents: true })}
        </span>
        {tag && (
          <Tag name={tag}>
            {tag === 'Tax set aside' && r ? `${formatMoney(r.reservedAmount, r.taxCurrency)} for tax` : tag === 'Tax paid' && r ? `${formatMoney(r.reservedAmount, r.taxCurrency)} tax paid` : undefined}
          </Tag>
        )}
      </div>
    </button>
  )
}
