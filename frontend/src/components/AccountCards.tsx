import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate, formatMoney, formatRate } from '../lib/money'
import { regimeName, regimeRule } from '../lib/taxjar'
import { useStore } from '../state/store'
import { ArrowIcon, Flag, JarIcon, Skeleton } from './ui'

const CARD = 'flex min-h-[318px] w-[86%] max-w-[360px] shrink-0 snap-center flex-col rounded-[32px] bg-surface'

/**
 * The swipeable cards under the balance, like the Wise app's account carousel:
 * your balances, the Tax Jar, and the rules it follows.
 */
export function AccountCards({ loading, className = '' }: { loading?: boolean; className?: string }) {
  const { account, profile, summary, countries } = useStore()
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const cards = profile.enabled ? 3 : 1

  const onScroll = () => {
    const el = track.current
    if (!el || !el.firstElementChild) return
    const step = (el.firstElementChild as HTMLElement).offsetWidth + 12
    setIndex(Math.min(cards - 1, Math.round(el.scrollLeft / step)))
  }

  if (loading) {
    return (
      <div className={`px-5 ${className}`}>
        <Skeleton className="h-[318px] rounded-[32px]" />
      </div>
    )
  }

  const rule = regimeRule(countries, profile.country, profile.regime)
  return (
    <div className={className}>
      <div ref={track} onScroll={onScroll} className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-5">
        <section aria-label="Main account" className={`${CARD} p-6`}>
          <h2 className="text-[26px] leading-tight font-semibold tracking-[-0.03em]">Main account</h2>
          <p className="mt-0.5 text-[16px] text-muted">{account.balances.length} currencies</p>
          <ul className="mt-5 space-y-3.5">
            {account.balances.slice(0, 3).map((b) => (
              <li key={b.currency} className="flex items-center gap-3.5">
                <Flag code={b.currency} size={44} />
                <span className="money text-[22px] font-medium">{formatMoney(b.amount, b.currency, { cents: true })}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-5">
            <Link to="/activity" className="press flex h-11 w-fit items-center gap-2 rounded-full bg-soft px-4 text-[16px] font-semibold">
              All payments
            </Link>
          </div>
        </section>

        {profile.enabled && (
          <section aria-label="Tax Jar" className={`${CARD} overflow-hidden`}>
            <Link to="/tax-jar" className="press flex flex-1 flex-col p-1.5">
              <span className="flex items-start justify-between rounded-[26px] bg-yellow px-5 pt-4 pb-9 text-forest">
                <span className="text-[20px] font-semibold tracking-[-0.02em]">Tax Jar</span>
                <JarIcon className="size-7" />
              </span>
              <span className="flex flex-1 flex-col px-4.5 pt-5 pb-4">
                <dl className="space-y-4">
                  <div>
                    <dt className="text-[14px] text-muted">Next deadline</dt>
                    <dd className="mt-0.5 text-[22px] font-medium">{summary.nextDeadline ? formatDate(summary.nextDeadline.toISOString()) : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[14px] text-muted">Tax paid so far</dt>
                    <dd className="money mt-0.5 text-[22px] font-medium">{formatMoney(summary.paid, summary.currency)}</dd>
                  </div>
                </dl>
                <span className="mt-auto flex items-center gap-2 text-[15px] font-semibold text-accent">
                  Open Tax Jar <ArrowIcon className="size-4" />
                </span>
              </span>
            </Link>
          </section>
        )}

        {profile.enabled && (
          <section aria-label="Tax rules" className={`${CARD} p-6`}>
            <p className="text-[16px] text-muted">
              {profile.country} · {formatRate(profile.rate)} of each work payment
            </p>
            <h2 className="display mt-3 text-[40px]">{regimeName(countries, profile.country, profile.regime)}</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">{rule || 'Your own rate, set by you.'}</p>
            <Link
              to="/onboarding"
              aria-label="Change tax settings"
              className="press mt-auto grid size-14 place-items-center rounded-full bg-lime text-forest"
            >
              <ArrowIcon className="size-6" />
            </Link>
          </section>
        )}
      </div>
      {cards > 1 && (
        <div className="mt-4 flex justify-center gap-2" aria-hidden="true">
          {Array.from({ length: cards }, (_, i) => (
            <span key={i} className={`size-2.5 rounded-full transition-colors ${i === index ? 'bg-lime' : 'bg-soft'}`} />
          ))}
        </div>
      )}
    </div>
  )
}
