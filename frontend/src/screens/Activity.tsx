import { useState } from 'react'
import { LoadError } from '../components/StateViews'
import { TransactionRow } from '../components/TransactionRow'
import { Card, Segmented, Skeleton } from '../components/ui'
import { useStore } from '../state/store'

type Filter = 'all' | 'pending' | 'tax'

export default function Activity() {
  const { profile, transactions, screen } = useStore()
  const [filter, setFilter] = useState<Filter>('all')

  const pending = transactions.filter((t) => t.direction === 'in' && t.classification.label === 'unknown')
  const tax = transactions.filter((t) => t.reservation)
  const list = filter === 'pending' ? pending : filter === 'tax' ? tax : transactions

  return (
    <div className="animate-rise px-5 pt-3 pb-8">
      <h1 className="text-[32px] leading-[1.06] font-extrabold tracking-[-0.04em]">Payments</h1>
      <p className="mt-1 text-[13.5px] text-muted">Everything that came in and went out.</p>

      <div className="mt-5">
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
      ) : (
        <Card className="mt-4 overflow-hidden">
          {screen === 'loading' ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-[15px] font-semibold">
                {filter === 'pending' ? 'Nothing needs an answer' : filter === 'tax' ? 'No tax set aside yet' : 'No payments yet'}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {filter === 'pending'
                  ? 'We’ll ask here when we’re not sure a payment is for work.'
                  : filter === 'tax'
                    ? 'A client payment will fill your Tax Jar automatically.'
                    : 'Incoming and outgoing payments will show up here.'}
              </p>
            </div>
          ) : (
            list.map((t, i, all) => (
              <TransactionRow key={t.id} tx={t} enabled={profile.enabled} last={i === all.length - 1} />
            ))
          )}
        </Card>
      )}

      <p className="mt-5 px-1 text-[12px] leading-relaxed text-muted">
        Tap a payment to see why it was classified the way it was, and the exact tax breakdown.
      </p>
    </div>
  )
}
