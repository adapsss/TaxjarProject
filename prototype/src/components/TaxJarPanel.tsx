import { Link, useNavigate } from 'react-router-dom'
import { liveCountries, useStore } from '../data/store'
import { formatDate, formatMoney, formatRate } from '../lib/money'
import { CountUp } from './CountUp'
import { MonthlyBars } from './MonthlyBars'
import { ArrowIcon, Button, Disclaimer, JarIcon } from './ui'

export const countryName = (code: string) => liveCountries().find((c) => c.code === code)?.name ?? code
export const regimeName = (code: string, regime: string) =>
  liveCountries().find((c) => c.code === code)?.regimes.find((r) => r.id === regime)?.name ?? regime

/** The compact, always-visible Tax Jar on Home. */
export function TaxJarPanel() {
  const { db, summary, flash } = useStore()
  const nav = useNavigate()
  const p = db.profile

  if (!p.enabled) {
    return (
      <div className="rounded-3xl bg-forest p-6 text-white">
        <span className="grid size-12 place-items-center rounded-2xl bg-lime text-forest">
          <JarIcon className="size-6" />
        </span>
        <h2 className="mt-5 text-[22px] leading-tight font-extrabold tracking-tight">Set money aside for taxes automatically</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          When a client pays you, we’ll move your tax share into a Tax Jar. Payments from friends stay untouched.
        </p>
        <Button className="mt-6 w-full" size="lg" onClick={() => nav('/setup')}>
          Set up in 3 steps
        </Button>
        <Disclaimer dark className="mt-4" />
      </div>
    )
  }

  return (
    <div className="relative rounded-3xl bg-forest p-6 text-white">
      <div className="flex items-center justify-between">
        <Link to="/tax-jar" className="flex items-center gap-2 text-[12px] font-bold tracking-[0.1em] text-lime uppercase hover:underline">
          <JarIcon className="size-4" /> Tax Jar
        </Link>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-semibold text-white/80">
          {countryName(p.country)} · {formatRate(p.rate)}
        </span>
      </div>

      <div className="relative mt-5">
        <CountUp value={summary.held} currency={summary.currency} className="block text-[44px] leading-none font-extrabold" />
        {flash && (
          <span key={flash.key} className="num absolute top-0 right-0 animate-pop rounded-full bg-lime px-2.5 py-1 text-sm font-bold text-forest">
            +{formatMoney(flash.amount, summary.currency)}
          </span>
        )}
        <p className="mt-2 text-sm text-white/65">set aside for taxes</p>
      </div>

      <div className="mt-6">
        <MonthlyBars data={summary.byMonth} currency={summary.currency} dark height={72} />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-2.5 text-sm">
        <div className="rounded-2xl bg-white/[0.07] px-3.5 py-3">
          <dt className="text-[12px] text-white/55">Next deadline</dt>
          <dd className="mt-0.5 font-bold">{summary.nextDeadline ? formatDate(summary.nextDeadline.toISOString()) : '—'}</dd>
        </div>
        <div className="rounded-2xl bg-white/[0.07] px-3.5 py-3">
          <dt className="text-[12px] text-white/55">Paid this year</dt>
          <dd className="num mt-0.5 font-bold">{formatMoney(summary.paid, summary.currency)}</dd>
        </div>
      </dl>

      <div className="mt-5 flex gap-2">
        <Button className="flex-1" onClick={() => nav('/tax-jar/pay')} disabled={summary.held === 0}>
          Pay tax
        </Button>
        <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => nav('/tax-jar')}>
          Details <ArrowIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
