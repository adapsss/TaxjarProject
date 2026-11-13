import { AppShell } from '../components/AppShell'
import { LoadError } from '../components/StateViews'
import { TaxJarPanel } from '../components/TaxJarPanel'
import { TransactionRow } from '../components/TransactionRow'
import { Card, Flag, Skeleton } from '../components/ui'
import { formatMoney } from '../lib/money'
import { useStore } from '../state/store'

export default function Home() {
  return (
    <AppShell>
      <HomeView />
    </AppShell>
  )
}

/** Home without the shell, so the transaction detail route can show it behind its drawer. */
// eslint-disable-next-line react-refresh/only-export-components
export function HomeView() {
  const { account, transactions, profile, screen, summary } = useStore()
  const first = account.owner.split(' ')[0]
  const pending = summary.pending.length
  const jars = account.jars.filter((j) => j.type === 'regular')

  if (screen === 'error')
    return (
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight text-forest">Home</h1>
        <LoadError className="mt-7" what="your account" />
      </div>
    )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-8">
      <div className="min-w-0">
        <h1 className="text-[32px] font-extrabold tracking-tight text-forest">{first ? `Hi, ${first}` : 'Hi'}</h1>
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
            <div className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-3">
              {account.balances.map((b) => (
                <Card key={b.currency} className="p-5">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
                    <Flag currency={b.currency} size={22} /> {b.currency}
                  </div>
                  <p className="num mt-4 text-[26px] leading-none font-extrabold">{formatMoney(b.amount, b.currency, { cents: true })}</p>
                </Card>
              ))}
            </div>

            {jars.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3">
                {jars.map((j) => (
                  <div key={j.id} className="flex items-center gap-2.5 rounded-full border border-line bg-white py-2 pr-4 pl-2.5 text-[13.5px]">
                    <span className="grid size-6 place-items-center rounded-full bg-canvas text-[11px] font-bold text-forest">{j.name[0]}</span>
                    <span className="font-medium text-muted">{j.name}</span>
                    <span className="num font-bold">{formatMoney(j.balance, j.currency)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-9 mb-3 flex items-end justify-between">
              <h2 className="text-[19px] font-bold">Latest activity</h2>
              {pending > 0 && (
                <span className="text-[13px] font-semibold text-amber-ink">
                  {pending} payment{pending > 1 ? 's' : ''} need{pending > 1 ? '' : 's'} your answer
                </span>
              )}
            </div>
            <Card className="p-2">
              {transactions.length === 0 ? (
                <p className="px-4 py-10 text-center text-[15px] text-muted">No payments yet. Money you receive will show up here.</p>
              ) : (
                transactions.slice(0, 10).map((t) => <TransactionRow key={t.id} tx={t} enabled={profile.enabled} />)
              )}
            </Card>
          </>
        )}
      </div>

      <div className="sticky top-8">
        {screen === 'loading' ? <Skeleton className="h-[460px] rounded-3xl bg-forest/15" /> : <TaxJarPanel />}
      </div>
    </div>
  )
}
