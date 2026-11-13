import { Link } from 'react-router-dom'
import { useDemoSheet } from '../components/demoSheetContext'
import { CatchUpCard } from '../components/CatchUpCard'
import { LoadError } from '../components/StateViews'
import { TaxJarPanel } from '../components/TaxJarPanel'
import { TransactionRow } from '../components/TransactionRow'
import { Avatar, ChevronRightIcon, Disclaimer, Flag, Skeleton, SparkleIcon } from '../components/ui'
import { useStore } from '../state/store'
import { formatMoney } from '../lib/money'

/** The right greeting for the time of day, on the phone's own clock. */
function greeting(hour = new Date().getHours()): string {
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Home() {
  const { profile, transactions, account, screen, summary } = useStore()
  const openDemo = useDemoSheet()
  const owner = account.owner || 'You'
  const first = owner.split(' ')[0]
  const pending = summary.pending.length

  return (
    <div className="animate-rise px-5 pt-2 pb-8">
      <header className="flex items-center justify-between">
        <Link to="/onboarding" aria-label="Tax settings" className="press rounded-full">
          <Avatar who={{ name: owner, kind: 'person', isKnownClient: false }} size={44} />
        </Link>
        <button
          type="button"
          data-testid="demo-trigger"
          onClick={openDemo}
          className="press flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-lime px-4 text-[15px] font-bold text-forest"
        >
          <SparkleIcon className="size-3.5" /> Demo
        </button>
      </header>

      <p className="mt-5 text-[13px] font-semibold tracking-[0.09em] text-muted uppercase">{greeting()}</p>
      <h1 className="mt-1 text-[30px] leading-[1.05] font-extrabold tracking-[-0.04em]">Hi, {first}</h1>
      <p className="mt-1 text-[15px] text-muted">Here’s where your money is today.</p>

      {screen === 'error' ? (
        <LoadError className="mt-6" what="your account" />
      ) : (
        <>
          <div className="mt-5">
            {screen === 'loading' ? <Skeleton className="h-[294px] rounded-[28px] bg-lime/35" /> : <TaxJarPanel />}
          </div>
          {screen === 'ready' && <CatchUpCard className="mt-3" />}

          {pending > 0 && screen !== 'loading' && (
            <Link
              to="/activity"
              state={{ filter: 'pending' }}
              className="press mt-3 flex items-center justify-between gap-3 rounded-2xl bg-amber-soft px-4 py-3 text-[14px] font-semibold text-amber-ink"
            >
              <span>
                {pending} payment{pending > 1 ? 's' : ''} need{pending > 1 ? '' : 's'} your answer
              </span>
              <ChevronRightIcon className="size-4" />
            </Link>
          )}

          <div className="mt-6 flex items-end justify-between">
            <h2 className="text-[19px] font-extrabold tracking-[-0.025em]">Your accounts</h2>
            <span className="text-[13px] text-muted">{account.balances.length} currencies</span>
          </div>
          <div className="no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1">
            {screen === 'loading'
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px] min-w-[148px] rounded-[22px]" />)
              : account.balances.map((b) => (
                  <div key={b.currency} className="min-w-[148px] rounded-[22px] bg-white p-4">
                    <div className="flex items-center gap-2 text-[14px] font-semibold">
                      <Flag code={b.currency} size={26} /> {b.currency}
                    </div>
                    <p className="money mt-3 text-[19px] leading-none font-extrabold">
                      {formatMoney(b.amount, b.currency, { cents: true })}
                    </p>
                    <p className="mt-1.5 text-[13px] text-muted">Available</p>
                  </div>
                ))}
          </div>

          <div className="mt-6 flex items-end justify-between">
            <h2 className="text-[19px] font-extrabold tracking-[-0.025em]">Latest activity</h2>
            <Link to="/activity" className="press -my-2 flex min-h-11 items-center gap-0.5 rounded-full pl-3 text-[15px] font-semibold text-forest">
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
            ) : transactions.length === 0 ? (
              <p className="px-5 py-8 text-center text-[14px] text-muted">No payments yet. They’ll show up here.</p>
            ) : (
              transactions.slice(0, 6).map((t, i, all) => (
                <TransactionRow key={t.id} tx={t} enabled={profile.enabled} last={i === all.length - 1} />
              ))
            )}
          </div>

          <Disclaimer className="mt-5 px-1" />
        </>
      )}
    </div>
  )
}
