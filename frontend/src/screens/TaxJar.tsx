import { Link, useNavigate } from 'react-router-dom'
import { CountUp } from '../components/CountUp'
import { MonthlyBars } from '../components/MonthlyBars'
import { TaxLines } from '../components/TaxLines'
import { totalLines } from '../lib/breakdown'
import { StatusPill } from '../components/Overlays'
import { LoadError } from '../components/StateViews'
import { countryName, isCustomRate } from '../lib/taxjar'
import {
  Avatar,
  Button,
  Card,
  CheckIcon,
  ChevronRightIcon,
  Disclaimer,
  DownloadIcon,
  Flag,
  JarIcon,
  Skeleton,
} from '../components/ui'
import { EXPORT_CSV_URL } from '../api/client'
import { useStore } from '../state/store'
import { formatDate, formatMoney, formatRate } from '../lib/money'

export default function TaxJar() {
  const { profile, summary, screen, flash, countries } = useStore()
  const nav = useNavigate()
  const p = profile
  const open = (id: string) => nav(`/transactions/${id}`, { state: { from: '/tax-jar' } })

  if (screen === 'error') return <LoadError what="your Tax Jar" />
  if (screen === 'loading') return <Loading />
  if (!p.enabled) return <NotSetUp />

  // The backend's export: every reservation, for an accountant.
  const download = () => Object.assign(document.createElement('a'), { href: EXPORT_CSV_URL, download: 'tax-jar.csv' }).click()
  const active = summary.reservations.filter((t) => t.reservation!.status !== 'undone')
  const empty = summary.reservations.length === 0
  // A custom rate has no law-defined split: show none, unless the backend sent an exact one.
  const custom = isCustomRate(countries, p.country, p.regime, p.rate)
  const taxLines = custom && !summary.breakdown?.length ? [] : totalLines(summary.breakdown, summary.breakdownRule)
  const deadline = summary.nextDeadline

  return (
    <div className="animate-rise px-5 pt-3 pb-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[40px] leading-[1.02] font-bold tracking-[-0.045em]">Tax Jar</h1>
          <p className="mt-2 flex items-center gap-2 text-[15px] text-muted">
            <Flag code={p.country} size={18} />
            {countryName(countries, p.country)} · {formatRate(p.rate)}
          </p>
        </div>
        <Link
          to="/onboarding"
          className="press mt-1 flex h-12 shrink-0 items-center rounded-full bg-lime-soft px-5 text-[16px] font-semibold text-accent hover:bg-soft"
        >
          Edit
        </Link>
      </header>

      <section className="mt-7">
        <p className="text-[16px] text-muted">Set aside for taxes</p>
        <div className="relative mt-1 flex items-center gap-3">
          <CountUp value={summary.held} currency={summary.currency} className="text-[44px] leading-[1.1] font-semibold text-ink" />
          {flash && (
            <span key={flash.key} className="money animate-pop rounded-full bg-lime px-2.5 py-1 text-[13px] font-bold text-forest">
              +{formatMoney(flash.amount, summary.currency)}
            </span>
          )}
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {empty ? (
            'Nothing set aside yet. Income you receive will show up here.'
          ) : deadline ? (
            <>
              Estimated <b className="text-ink">{formatMoney(summary.estimatedDue, summary.currency)}</b> due by{' '}
              <b className="text-ink">{formatDate(deadline.toISOString(), true)}</b>
            </>
          ) : (
            <>
              Estimated <b className="text-ink">{formatMoney(summary.estimatedDue, summary.currency)}</b> to pay when your return is due
            </>
          )}
        </p>
        <div className="mt-5 flex gap-2">
          <Button disabled={summary.held === 0} onClick={() => nav('/tax-jar/pay')}>
            Pay tax
          </Button>
          <Button variant="secondary" disabled={empty} onClick={download}>
            <DownloadIcon className="size-4" /> Export CSV
          </Button>
        </div>
      </section>

      {!empty && taxLines.length > 0 && (
        <Card className="mt-6 px-5 pt-4">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">What your tax pays for</h2>
          <TaxLines lines={taxLines} currency={summary.currency} />
        </Card>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat k="Tax paid so far" v={formatMoney(summary.paid, summary.currency)} />
        <MiniStat k="Next deadline" v={deadline ? formatDate(deadline.toISOString()) : '—'} />
        <MiniStat k="With tax" v={String(active.length)} />
      </div>

      <Card className="mt-4 p-5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">By month</h2>
          <div className="flex gap-3 text-[12px] text-muted">
            <span className="flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-lime" /> In the jar
            </span>
            <span className="flex items-center gap-1.5">
              <i className="size-2 rounded-full bg-forest/80" /> Paid
            </span>
          </div>
        </div>
        {empty ? (
          <div className="grid h-[132px] place-items-center rounded-2xl bg-canvas px-6 text-center">
            <p className="text-[14px] leading-relaxed text-muted">
              No chart yet. It fills up with your first client payment.
            </p>
          </div>
        ) : (
          <MonthlyBars data={summary.byMonth} currency={summary.currency} height={132} showValues />
        )}
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold tracking-[-0.02em]">Needs your answer</h2>
          {summary.pending.length > 0 && (
            <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[13px] font-bold text-amber-ink">{summary.pending.length}</span>
          )}
        </div>
        {summary.pending.length === 0 ? (
          <div className="flex flex-col items-center py-5 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-lime-soft text-lime-ink">
              <CheckIcon className="size-5" />
            </span>
            <p className="mt-2 text-[15px] font-semibold">All payments sorted</p>
            <p className="mt-0.5 text-[13px] text-muted">We’ll ask when we’re not sure a payment is for work.</p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-[14px] text-muted">We weren’t sure these were for work.</p>
            <ul className="mt-3 space-y-2">
              {summary.pending.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-amber-soft/55 px-3 py-2.5">
                  <Avatar who={t.counterparty} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{t.counterparty.name}</p>
                    <p className="money truncate text-[13px] text-muted">
                      {formatMoney(t.amount, t.currency)} · {t.reference}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => open(t.id)}>
                    Answer
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <div className="mt-6 flex items-end justify-between">
        <h2 className="text-[22px] font-semibold tracking-[-0.03em]">What went in</h2>
        <span className="text-[13px] text-muted">Tap for the breakdown</span>
      </div>
      <Card className="mt-3 overflow-hidden">
        {empty ? (
          <div className="px-5 pt-7 pb-9 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-soft text-muted">
              <JarIcon className="size-6" />
            </span>
            <p className="mt-3 text-[15px] font-semibold">Nothing set aside yet</p>
            <p className="mt-1 text-[14px] text-muted">When a client pays you, the tax share lands here automatically.</p>
          </div>
        ) : (
          summary.reservations.map((t, i, all) => {
            const r = t.reservation!
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => open(t.id)}
                className={`press flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left hover:bg-canvas ${
                  i < all.length - 1 ? 'border-b border-line/70' : ''
                } ${r.status === 'undone' ? 'opacity-60' : ''}`}
              >
                <Avatar who={t.counterparty} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{t.counterparty.name}</span>
                    <StatusPill status={r.status} />
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted">
                    {formatDate(t.createdAt)} · {t.reference}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`money block text-[15px] font-bold ${r.status === 'undone' ? 'line-through' : ''}`}>
                    {formatMoney(r.reservedAmount, r.taxCurrency, { cents: true })}
                  </span>
                  <span className="money mt-0.5 block text-[12px] text-muted">{formatMoney(t.amount, t.currency)} in</span>
                </span>
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted" />
              </button>
            )
          })
        )}
      </Card>

      <Disclaimer className="mt-5 px-1" />
    </div>
  )
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-[18px] bg-surface px-3 py-3">
      <p className="text-[12px] leading-tight text-muted">{k}</p>
      <p className="money mt-1 text-[15px] font-bold">{v}</p>
    </div>
  )
}

function Loading() {
  return (
    <div className="px-5 pt-3">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-2 h-4 w-52" />
      <Skeleton className="mt-5 h-[330px] rounded-[28px]" />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[62px] rounded-[18px]" />
        ))}
      </div>
      <Skeleton className="mt-4 h-[230px] rounded-[24px]" />
    </div>
  )
}

function NotSetUp() {
  const nav = useNavigate()
  const steps = [
    ['A client pays you', 'Acme Inc. sends $1,500 with “INV-042”.'],
    ['We set the tax aside', '20% moves into your Tax Jar, converted to EUR at that moment.'],
    ['You pay when it’s due', 'One tap sends it to the tax authority, or export it for your accountant.'],
  ]
  return (
    <div className="animate-rise px-5 pt-3 pb-8">
      <div className="rounded-[32px] bg-surface p-6">
        <span className="grid size-12 place-items-center rounded-full bg-lime text-forest">
          <JarIcon className="size-6" />
        </span>
        <h1 className="display mt-6 text-[46px]">Never be surprised by a tax bill</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">
          Your Tax Jar isn’t set up yet. It takes three taps, and payments from friends are never touched.
        </p>
        <Button size="lg" className="mt-6 w-full" onClick={() => nav('/onboarding')}>
          Set up my Tax Jar
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-[28px] bg-surface">
        {steps.map(([t, d], i) => (
          <div key={t} className={`flex gap-3.5 px-4 py-4 ${i < steps.length - 1 ? 'border-b border-line/70' : ''}`}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-lime text-[13px] font-bold text-forest">{i + 1}</span>
            <div>
              <p className="text-[15px] font-semibold">{t}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{d}</p>
            </div>
          </div>
        ))}
      </div>
      <Disclaimer className="mt-5 px-1" />
    </div>
  )
}
