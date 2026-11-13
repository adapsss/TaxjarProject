import { Link } from 'react-router-dom'
import { useDemoSheet } from '../components/AppShell'
import { LoadError } from '../components/StateViews'
import { TaxJarPanel } from '../components/TaxJarPanel'
import { TransactionRow } from '../components/TransactionRow'
import { Avatar, ChevronRightIcon, Disclaimer, Flag, Skeleton, SparkleIcon } from '../components/ui'
import { useStore } from '../data/store'
import { formatMoney } from '../lib/money'

export function Home() {
  const { db, screen, summary } = useStore()
  const openDemo = useDemoSheet()
  const owner = db.account.owner || 'You'
  const first = owner.split(' ')[0]
  const pending = summary.pending.length

  return (
    <div className="animate-rise px-5 pt-2 pb-8">
      <header className="flex items-center justify-between">
        <Link to="/setup" aria-label="Tax settings" className="press rounded-full">
          <Avatar who={{ name: owner, kind: 'person', isKnownClient: false }} size={42} />
        </Link>
        <button
          type="button"
          data-testid="demo-trigger"
          onClick={openDemo}
          className="press flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-lime px-3.5 text-[12.5px] font-bold text-forest"
        >
          <SparkleIcon className="size-3.5" /> Demo
        </button>
      </header>

      <p className="mt-5 text-[11.5px] font-semibold tracking-[0.09em] text-muted uppercase">Good morning</p>
      <h1 className="mt-1 text-[30px] leading-[1.05] font-extrabold tracking-[-0.04em]">Hi, {first}</h1>
      <p className="mt-1 text-[13.5px] text-muted">Here’s where your money is today.</p>

      {screen === 'error' ? (
        <LoadError className="mt-6" what="your account" />
      ) : (
        <>
          <div className="mt-5">
            {screen === 'loading' ? <Skeleton className="h-[294px] rounded-[28px] bg-lime/35" /> : <TaxJarPanel />}
          </div>

          {pending > 0 && screen !== 'loading' && (
            <Link
              to="/tax-jar"
              className="press mt-3 flex items-center justify-between gap-3 rounded-2xl bg-amber-soft px-4 py-3 text-[13px] font-semibold text-amber-ink"
            >
              <span>
                {pending} payment{pending > 1 ? 's' : ''} need{pending > 1 ? '' : 's'} your answer
              </span>
              <ChevronRightIcon className="size-4" />
            </Link>
          )}

          <div className="mt-6 flex items-end justify-between">
            <h2 className="text-[19px] font-extrabold tracking-[-0.025em]">Your accounts</h2>
            <span className="text-[12px] text-muted">{db.account.balances.length} currencies</span>
          </div>
          <div className="no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1">
            {screen === 'loading'
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px] min-w-[148px] rounded-[22px]" />)
              : db.account.balances.map((b) => (
                  <div key={b.currency} className="min-w-[148px] rounded-[22px] bg-white p-4">
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                      <Flag code={b.currency} size={26} /> {b.currency}
                    </div>
                    <p className="money mt-3 text-[19px] leading-none font-extrabold">
                      {formatMoney(b.amount, b.currency, { cents: true })}
                    </p>
                    <p className="mt-1.5 text-[11px] text-muted">Available</p>
                  </div>
                ))}
          </div>

          <div className="mt-6 flex items-end justify-between">
            <h2 className="text-[19px] font-extrabold tracking-[-0.025em]">Latest activity</h2>
            <Link to="/activity" className="flex items-center gap-0.5 text-[13px] font-semibold text-forest">
              See all <ChevronRightIcon className="size-3.5" />
            </Link>
          </div>
          <div className="mt-3 overflow-hidden rounded-[24px] bg-white">
            {screen === 'loading' ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : db.transactions.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-muted">No payments yet. They’ll show up here.</p>
            ) : (
              db.transactions.slice(0, 6).map((t, i, all) => (
                <TransactionRow key={t.id} tx={t} enabled={db.profile.enabled} last={i === all.length - 1} />
              ))
            )}
          </div>

          <Disclaimer className="mt-5 px-1" />
        </>
      )}
    </div>
  )
}
