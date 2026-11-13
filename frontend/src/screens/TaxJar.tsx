import { Link, useNavigate } from 'react-router-dom'
import { EXPORT_CSV_URL } from '../api/client'
import { AppShell } from '../components/AppShell'
import { CatchUpCard } from '../components/CatchUpCard'
import { CountUp } from '../components/CountUp'
import { MonthlyBars } from '../components/MonthlyBars'
import { StatusPill } from '../components/Overlays'
import { LoadError } from '../components/StateViews'
import { Avatar, Button, Card, CheckIcon, Disclaimer, JarIcon, Skeleton } from '../components/ui'
import { formatDate, formatMoney, formatRate } from '../lib/money'
import { countryName, regimeName } from '../lib/taxjar'
import { useStore } from '../state/store'

export default function TaxJar() {
  return (
    <AppShell>
      <TaxJarView />
    </AppShell>
  )
}

/** The Tax Jar page without the shell, so the transaction detail route can show it behind its drawer. */
// eslint-disable-next-line react-refresh/only-export-components
export function TaxJarView() {
  const { profile: p, summary, screen, flash, countries } = useStore()
  const nav = useNavigate()
  const open = (id: string) => nav(`/transactions/${id}`, { state: { from: '/tax-jar' } })

  if (screen === 'error') return <LoadError what="your Tax Jar" />
  if (screen === 'loading') return <Loading />
  if (!p.enabled) return <NotSetUp />

  // The backend's export: every reservation, for an accountant.
  const download = () => Object.assign(document.createElement('a'), { href: EXPORT_CSV_URL, download: 'tax-jar.csv' }).click()
  const empty = summary.reservations.length === 0
  const deadline = summary.nextDeadline

  return (
    <div>
      <header className="flex items-end justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-[32px] font-extrabold tracking-tight text-forest">
            <JarIcon className="size-8" /> Tax Jar
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">
            {countryName(countries, p.country)} · {regimeName(countries, p.country, p.regime)} · {formatRate(p.rate)} of each work payment, kept in {p.taxCurrency}
            <Link to="/onboarding" className="ml-2 font-semibold text-forest underline underline-offset-2">
              Edit
            </Link>
          </p>
        </div>
      </header>

      <CatchUpCard className="mt-7" />

      {/* Hero */}
      <section className="relative mt-7 overflow-hidden rounded-[28px] bg-forest px-6 py-7 text-white md:px-9 md:py-8">
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-10">
          <div>
            <p className="text-[13px] font-bold tracking-[0.1em] text-lime uppercase">Set aside for taxes</p>
            <div className="relative mt-3 flex items-start gap-4">
              <CountUp value={summary.held} currency={summary.currency} className="text-[52px] leading-[0.95] font-extrabold md:text-[72px]" />
              {flash && (
                <span key={flash.key} className="num mt-2 animate-pop rounded-full bg-lime px-3 py-1 text-base font-bold text-forest">
                  +{formatMoney(flash.amount, summary.currency)}
                </span>
              )}
            </div>
            <p className="mt-4 text-[15px] text-white/70">
              {empty
                ? 'Nothing set aside yet. Income you receive will show up here.'
                : deadline
                  ? <>Estimated <b className="text-white">{formatMoney(summary.estimatedDue, summary.currency)}</b> due by <b className="text-white">{formatDate(deadline.toISOString(), true)}</b></>
                  : <>Estimated <b className="text-white">{formatMoney(summary.estimatedDue, summary.currency)}</b> to pay when your return is due</>}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2.5">
            <Button size="lg" className="md:min-w-[200px]" disabled={summary.held === 0} onClick={() => nav('/tax-jar/pay')}>
              Pay tax
            </Button>
            <Button size="lg" variant="ghost" className="text-white ring-1 ring-white/25 ring-inset hover:bg-white/10" disabled={empty} onClick={download}>
              Export CSV for accountant
            </Button>
          </div>
        </div>
        {!empty && summary.breakdown && summary.breakdown.length > 0 && (
          <dl className="relative mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[14px]">
            <dt className="text-white/55">Of which</dt>
            {summary.breakdown.map((part) => (
              <div key={part.id} className="flex items-baseline gap-2">
                <dd className="num text-[17px] font-bold">{formatMoney(part.amount, summary.currency, { cents: true })}</dd>
                <dt className="text-white/70">{part.name.toLowerCase()}</dt>
              </div>
            ))}
          </dl>
        )}
        {!empty && !summary.breakdown && summary.breakdownRule && (
          <p className="relative mt-6 text-[14px] text-white/70">
            How it’s taxed: <span className="font-semibold text-white">{summary.breakdownRule}</span>.
            {/* A rule quoted per payment means a split exists but not for this mix of reservations, so the note would be wrong. */}
            {!summary.breakdownRule.includes('of each payment') && ' The split between taxes is worked out on your return, not per payment.'}
          </p>
        )}
        <dl className="relative mt-8 grid grid-cols-2 gap-x-3 gap-y-5 border-t border-white/10 pt-6 md:grid-cols-4">
          <Stat k="Tax paid so far" v={formatMoney(summary.paid, summary.currency)} />
          <Stat k="Next deadline" v={deadline ? formatDate(deadline.toISOString()) : '—'} />
          <Stat k="Payments with tax" v={String(summary.reservations.filter((t) => t.reservation!.status !== 'undone').length)} />
          <Stat k="Rate" v={formatRate(p.rate)} />
        </dl>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card className="p-7">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-[18px] font-bold">By month</h2>
            <div className="flex gap-4 text-[12.5px] text-muted">
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-lime" /> In the jar</span>
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-forest/25" /> Paid</span>
            </div>
          </div>
          <MonthlyBars data={summary.byMonth} currency={summary.currency} height={170} showValues />
        </Card>

        <Card className="flex flex-col p-7">
          <h2 className="text-[18px] font-bold">Needs your answer</h2>
          {summary.pending.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-lime-soft text-lime-ink">
                <CheckIcon className="size-5" />
              </span>
              <p className="mt-3 font-semibold">All payments sorted</p>
              <p className="mt-1 text-sm text-muted">We’ll ask when we’re not sure a payment is for work.</p>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">We weren’t sure these were for work.</p>
              <ul className="mt-4 space-y-2">
                {summary.pending.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-amber-soft/60 px-3 py-2.5">
                    <Avatar who={t.counterparty} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{t.counterparty.name}</p>
                      <p className="num truncate text-[12.5px] text-muted">{formatMoney(t.amount, t.currency)} · {t.reference}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => open(t.id)}>Answer</Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-2">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[18px] font-bold">What went into the jar</h2>
          <span className="hidden text-[13px] text-muted sm:inline">Click a row for the breakdown</span>
        </div>
        {empty ? (
          <div className="px-5 pt-6 pb-12 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-canvas text-forest/40">
              <JarIcon className="size-7" />
            </span>
            <p className="mt-4 font-semibold">Nothing set aside yet</p>
            <p className="mt-1 text-sm text-muted">When a client pays you, the tax share lands here automatically.</p>
          </div>
        ) : (
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="text-[12px] tracking-wide text-muted uppercase">
                <th className="hidden px-3 py-2 sm:px-5 font-semibold sm:table-cell">Date</th>
                <th className="px-3 py-2 sm:px-5 font-semibold">From</th>
                <th className="hidden px-3 py-2 sm:px-5 text-right font-semibold md:table-cell">Received</th>
                <th className="px-3 py-2 sm:px-5 text-right font-semibold">Set aside</th>
                <th className="px-3 py-2 text-right font-semibold sm:px-5"><span className="sr-only sm:not-sr-only">Status</span></th>
              </tr>
            </thead>
            <tbody>
              {summary.reservations.map((t) => {
                const r = t.reservation!
                return (
                  <tr
                    key={t.id}
                    tabIndex={0}
                    aria-label={`${t.counterparty.name}, ${formatMoney(r.reservedAmount, r.taxCurrency)} ${r.status === 'reserved' ? 'set aside' : r.status}`}
                    onClick={() => open(t.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(t.id))}
                    className={`cursor-pointer outline-none focus-visible:bg-lime-soft border-t border-line transition-colors hover:bg-canvas ${r.status === 'undone' ? 'text-muted' : ''}`}>
                    <td className="hidden px-3 py-3.5 sm:px-5 whitespace-nowrap text-muted sm:table-cell">{formatDate(t.createdAt)}</td>
                    <td className="px-3 py-3.5 sm:px-5">
                      <div className="flex items-center gap-3">
                        <span className="hidden sm:block">
                          <Avatar who={t.counterparty} size={34} />
                        </span>
                        <div className="max-w-[34vw] min-w-0 sm:max-w-none">
                          <p className="truncate font-semibold">{t.counterparty.name}</p>
                          <p className="truncate text-[12.5px] text-muted">{t.reference}</p>
                        </div>
                      </div>
                    </td>
                    <td className="num hidden px-3 py-3.5 sm:px-5 text-right md:table-cell">{formatMoney(t.amount, t.currency, { cents: true })}</td>
                    <td className={`num px-3 py-3.5 sm:px-5 text-right font-bold ${r.status === 'undone' ? 'line-through' : ''}`}>{formatMoney(r.reservedAmount, r.taxCurrency, { cents: true })}</td>
                    <td className="px-3 py-3.5 sm:px-5 text-right"><StatusPill status={r.status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Disclaimer className="mt-6" />
    </div>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[12.5px] text-white/55">{k}</dt>
      <dd className="num mt-1 text-[20px] font-bold">{v}</dd>
    </div>
  )
}

function Loading() {
  return (
    <div>
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-3 h-5 w-96" />
      <Skeleton className="mt-7 h-[290px] rounded-[28px] bg-forest/15" />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.7fr_1fr]">
        <Skeleton className="h-[280px] rounded-3xl" />
        <Skeleton className="h-[280px] rounded-3xl" />
      </div>
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
    <div className="mx-auto max-w-[760px] pt-6 text-center">
      <span className="mx-auto grid size-20 place-items-center rounded-[26px] bg-lime text-forest">
        <JarIcon className="size-10" />
      </span>
      <h1 className="mt-6 text-[30px] leading-tight md:text-[38px] font-extrabold tracking-tight text-forest">Never be surprised by a tax bill</h1>
      <p className="mx-auto mt-3 max-w-[520px] text-[17px] leading-relaxed text-muted">
        Your Tax Jar isn’t set up yet. It takes three taps, and payments from friends are never touched.
      </p>
      <ol className="mt-10 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
        {steps.map(([t, d], i) => (
          <li key={t} className="rounded-3xl border border-line bg-white p-5">
            <span className="grid size-8 place-items-center rounded-full bg-forest text-sm font-bold text-lime">{i + 1}</span>
            <p className="mt-4 font-bold">{t}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
          </li>
        ))}
      </ol>
      <Button size="lg" className="mt-10 min-w-[240px]" onClick={() => nav('/onboarding')}>
        Set up my Tax Jar
      </Button>
      <Disclaimer className="mt-5 justify-center" />
    </div>
  )
}
