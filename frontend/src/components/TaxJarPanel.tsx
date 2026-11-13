import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { formatDate, formatMoney, formatRate } from '../lib/money'
import { CountUp } from './CountUp'
import { Button, Disclaimer, Flag, JarIcon } from './ui'

/** The Tax Jar card on Home: the one number the product is about. */
export function TaxJarPanel() {
  const { profile, summary, flash } = useStore()
  const nav = useNavigate()
  const p = profile

  if (!p.enabled) {
    return (
      <section data-testid="tax-jar-panel" className="overflow-hidden rounded-[28px] bg-lime p-5 text-forest">
        <span className="grid size-11 place-items-center rounded-full bg-forest text-lime">
          <JarIcon className="size-5" />
        </span>
        <h2 className="mt-4 text-[24px] leading-[1.08] font-extrabold tracking-[-0.035em]">
          Never be surprised by a tax bill
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-forest/70">
          When a client pays you, we move your tax share into a Tax Jar. Payments from friends stay untouched.
        </p>
        <Button variant="dark" size="lg" className="mt-5 w-full" onClick={() => nav('/onboarding')}>
          Set up in 3 steps
        </Button>
        <Disclaimer dark={false} className="mt-4 text-forest/55" />
      </section>
    )
  }

  return (
    <section data-testid="tax-jar-panel" className="overflow-hidden rounded-[28px] bg-lime p-5 text-forest">
      <div className="flex items-center justify-between gap-3">
        <Link to="/tax-jar" className="flex items-center gap-2 text-[11.5px] font-bold tracking-[0.1em] uppercase">
          <JarIcon className="size-4" /> Tax Jar
        </Link>
        <span className="flex items-center gap-1.5 rounded-full bg-white/45 px-2.5 py-1 text-[11px] font-semibold">
          <Flag code={p.country} size={16} /> {p.country} · {formatRate(p.rate)}
        </span>
      </div>

      <div className="relative mt-4 flex items-start justify-between gap-3">
        <div>
          <CountUp value={summary.held} currency={summary.currency} className="block text-[43px] leading-none font-extrabold" />
          <p className="mt-1.5 text-[13px] font-medium text-forest/60">set aside for taxes</p>
        </div>
        {flash && (
          <span key={flash.key} className="money animate-pop mt-1 rounded-full bg-forest px-2.5 py-1 text-[12px] font-bold text-lime">
            +{formatMoney(flash.amount, summary.currency)}
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-2xl bg-white/40 px-3.5 py-2.5">
          <dt className="text-forest/55">Next deadline</dt>
          <dd className="mt-0.5 font-bold">{summary.nextDeadline ? formatDate(summary.nextDeadline.toISOString()) : '—'}</dd>
        </div>
        <div className="rounded-2xl bg-white/40 px-3.5 py-2.5">
          <dt className="text-forest/55">Paid this year</dt>
          <dd className="money mt-0.5 font-bold">{formatMoney(summary.paid, summary.currency)}</dd>
        </div>
      </dl>

      <div className="mt-3.5 flex gap-2">
        <Button variant="dark" className="flex-1" onClick={() => nav('/tax-jar/pay')} disabled={summary.held === 0}>
          Pay tax
        </Button>
        <Button variant="secondary" className="flex-1 border-forest/25 ring-forest/25" onClick={() => nav('/tax-jar')}>
          Details
        </Button>
      </div>
    </section>
  )
}
