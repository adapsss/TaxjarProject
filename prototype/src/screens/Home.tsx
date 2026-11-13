import { useStore } from '../data/store'
import { TaxJarPanel } from '../components/TaxJarPanel'
import { TransactionRow } from '../components/TransactionRow'
import { Card, Flag, Skeleton } from '../components/ui'
import { LoadError } from '../components/StateViews'
import { formatMoney } from '../lib/money'

export function Home() {
  const { db, screen, summary } = useStore()
  const first = db.account.owner.split(' ')[0]
  const pending = summary.pending.length

  if (screen === 'error')
    return (
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight text-forest">Hi, {first}</h1>
        <LoadError className="mt-7" what="your account" />
      </div>
    )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-8">
      <div className="min-w-0">
        <h1 className="text-[32px] font-extrabold tracking-tight text-forest">Hi, {first}</h1>
        <p className="mt-1 text-[15px] text-muted">Here’s where your money is today.</p>

        {screen === 'loading' ? (
          <>
            <div className="mt-7 grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px] rounded-3xl" />)}
            </div>
            <Skeleton className="mt-9 h-6 w-40" />
            <div className="mt-4 space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          </>
        ) : (
          <>
            <div className="mt-7 grid grid-cols-3 gap-3">
              {db.account.balances.map((b) => (
                <Card key={b.currency} className="p-5">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
                    <Flag currency={b.currency} size={22} /> {b.currency}
                  </div>
                  <p className="num mt-4 text-[26px] leading-none font-extrabold">{formatMoney(b.amount, b.currency, { cents: true })}</p>
                </Card>
              ))}
            </div>

            <div className="mt-9 mb-3 flex items-end justify-between">
              <h2 className="text-[19px] font-bold">Latest activity</h2>
              {pending > 0 && (
                <span className="text-[13px] font-semibold text-amber-ink">
                  {pending} payment{pending > 1 ? 's' : ''} need{pending > 1 ? '' : 's'} your answer
                </span>
              )}
            </div>
            <Card className="p-2">
              {db.transactions.slice(0, 8).map((t) => (
                <TransactionRow key={t.id} tx={t} enabled={db.profile.enabled} />
              ))}
            </Card>
          </>
        )}
      </div>

      <div className="sticky top-8">
        {screen === 'loading' ? (
          <Skeleton className="h-[460px] rounded-3xl bg-forest/15" />
        ) : (
          <TaxJarPanel />
        )}
      </div>
    </div>
  )
}
