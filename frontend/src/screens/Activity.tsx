import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { HowItWorks } from '../components/HowItWorks'
import { LoadError } from '../components/StateViews'
import { TransactionRow } from '../components/TransactionRow'
import { Segmented, Skeleton } from '../components/ui'
import { relativeDay } from '../lib/money'
import { useStore } from '../state/store'

type Filter = 'all' | 'pending' | 'tax'

export default function Activity() {
  const { profile, transactions, screen } = useStore()
  // Home's "N payments need your answer" link opens this screen already filtered.
  const wanted = (useLocation().state as { filter?: Filter } | null)?.filter
  const [filter, setFilter] = useState<Filter>(wanted ?? 'all')

  const pending = transactions.filter((t) => t.direction === 'in' && t.classification.label === 'unknown')
  const tax = transactions.filter((t) => t.reservation)
  const list = filter === 'pending' ? pending : filter === 'tax' ? tax : transactions

  // Day by day, like a bank statement: "Today", "Yesterday", then the date.
  const days: { day: string; items: typeof list }[] = []
  for (const t of list) {
    const day = relativeDay(t.createdAt)
    const last = days[days.length - 1]
    if (last && last.day === day) last.items.push(t)
    else days.push({ day, items: [t] })
  }

  return (
    <div className="animate-rise px-5 pt-3 pb-8">
      <h1 className="text-[40px] leading-[1.02] font-bold tracking-[-0.045em]">Payments</h1>
      <p className="mt-2 text-[16px] text-muted">Everything that came in and went out.</p>

      <div className="mt-6">
        <HowItWorks />
      </div>

      <div className="mt-6">
        <Segmented<Filter>
          label="Filter payments"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'All' },
            { id: 'pending', label: 'To answer' },
            { id: 'tax', label: 'Tax' },
          ]}
        />
      </div>

      {screen === 'error' ? (
        <LoadError className="mt-5" what="your payments" />
      ) : screen === 'loading' ? (
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="mt-5 rounded-[28px] bg-surface px-6 py-12 text-center">
          <p className="text-[17px] font-semibold">
            {filter === 'pending' ? 'Nothing needs an answer' : filter === 'tax' ? 'No tax set aside yet' : 'No payments yet'}
          </p>
          <p className="mt-1.5 text-[15px] text-muted">
            {filter === 'pending'
              ? 'We’ll ask here when we’re not sure a payment is for work.'
              : filter === 'tax'
                ? 'A client payment will fill your Tax Jar automatically.'
                : 'Incoming and outgoing payments will show up here.'}
          </p>
        </div>
      ) : (
        days.map(({ day, items }) => (
          <section key={day} aria-label={day} className="mt-6">
            <h2 className="px-2 text-[15px] font-semibold text-muted">{day}</h2>
            <div className="mt-1">
              {items.map((t) => (
                <TransactionRow key={t.id} tx={t} enabled={profile.enabled} showDay={false} />
              ))}
            </div>
          </section>
        ))
      )}

      <p className="mt-6 px-2 text-[14px] leading-relaxed text-muted">
        Tap a payment to see how it was handled, step by step, and the exact tax taken from it.
      </p>
    </div>
  )
}
