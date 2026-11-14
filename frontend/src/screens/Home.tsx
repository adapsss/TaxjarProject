import { Link } from 'react-router-dom'
import { AccountCards } from '../components/AccountCards'
import { CatchUpCard } from '../components/CatchUpCard'
import { useDemoSheet } from '../components/demoSheetContext'
import { LoadError } from '../components/StateViews'
import { TaxJarPanel } from '../components/TaxJarPanel'
import { TransactionRow } from '../components/TransactionRow'
import { Avatar, ChevronRightIcon, Disclaimer, Skeleton, SparkleIcon } from '../components/ui'
import { useStore } from '../state/store'

export default function Home() {
  const { profile, transactions, account, screen, summary } = useStore()
  const openDemo = useDemoSheet()
  const owner = account.owner || 'You'
  const first = owner.split(' ')[0]
  const pending = summary.pending.length

  return (
    <div className="animate-rise pt-2 pb-8">
      <h1 className="sr-only">Hi, {first}</h1>
      <header className="flex items-center justify-between px-5">
        <Link to="/onboarding" aria-label="Tax settings" className="press relative rounded-full">
          <Avatar who={{ name: owner, kind: 'person', isKnownClient: false }} size={48} />
          {pending > 0 && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-danger ring-2 ring-canvas" />}
        </Link>
        <button
          type="button"
          data-testid="demo-trigger"
          onClick={openDemo}
          className="press flex h-12 cursor-pointer items-center gap-2 rounded-full bg-lime px-5 text-[17px] font-semibold text-forest"
        >
          <SparkleIcon className="size-4" /> Demo
        </button>
      </header>

      {screen === 'error' ? (
        <div className="px-5">
          <LoadError className="mt-6" what="your account" />
        </div>
      ) : (
        <>
          <div className="mt-8 px-5">
            {screen === 'loading' ? <Skeleton className="h-[150px] rounded-[28px]" /> : <TaxJarPanel />}
          </div>

          <AccountCards loading={screen === 'loading'} className="mt-6" />

          <div className="px-5">
            {screen === 'ready' && <CatchUpCard className="mt-6" />}

            {pending > 0 && screen !== 'loading' && (
              <Link
                to="/activity"
                state={{ filter: 'pending' }}
                className="press mt-3 flex items-center justify-between gap-3 rounded-[24px] bg-amber-soft px-5 py-4 text-[15px] font-semibold text-amber-ink"
              >
                <span>
                  {pending} payment{pending > 1 ? 's' : ''} need{pending > 1 ? '' : 's'} your answer
                </span>
                <ChevronRightIcon className="size-4" />
              </Link>
            )}

            <div className="mt-8 flex items-end justify-between">
              <h2 className="text-[22px] font-semibold tracking-[-0.03em]">Latest activity</h2>
              <Link to="/activity" className="press -my-2 flex min-h-11 items-center gap-0.5 rounded-full pl-3 text-[16px] font-semibold text-accent">
                See all <ChevronRightIcon className="size-3.5" />
              </Link>
            </div>
            <div className="mt-2">
              {screen === 'loading' ? (
                <div className="space-y-3 py-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <p className="py-8 text-center text-[15px] text-muted">No payments yet. They’ll show up here.</p>
              ) : (
                transactions.slice(0, 6).map((t) => <TransactionRow key={t.id} tx={t} enabled={profile.enabled} />)
              )}
            </div>

            <Disclaimer className="mt-6 px-1" />
          </div>
        </>
      )}
    </div>
  )
}
