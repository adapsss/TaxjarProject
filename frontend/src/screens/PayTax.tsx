import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { LoadError } from '../components/StateViews'
import { Button, Card, CheckIcon, Disclaimer, JarIcon, Skeleton } from '../components/ui'
import { formatDate, formatMoney, monthShort } from '../lib/money'
import { TAX_AUTHORITY } from '../lib/taxjar'
import { useStore } from '../state/store'

export default function PayTax() {
  return (
    <AppShell>
      <PayTaxView />
    </AppShell>
  )
}

function PayTaxView() {
  const { summary, pay, busy, profile, screen } = useStore()
  const nav = useNavigate()
  const [paid, setPaid] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cur = summary.currency

  if (paid !== null) {
    return (
      <Shell>
        <Card className="animate-rise px-10 pt-12 pb-10 text-center">
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-lime text-forest">
            <CheckIcon className="size-10" />
          </span>
          <p className="num mt-6 text-[44px] leading-none font-extrabold tracking-tight">{formatMoney(paid, cur, { cents: true })}</p>
          <h1 className="mt-3 text-[22px] font-bold">paid to {TAX_AUTHORITY}</h1>
          <p className="mx-auto mt-3 max-w-[380px] text-[15px] leading-relaxed text-muted">
            Your Tax Jar is empty now. It starts filling again with your next client payment.
          </p>
          <div className="mt-8 flex justify-center gap-2.5">
            <Button variant="secondary" size="lg" onClick={() => nav('/tax-jar')}>Back to Tax Jar</Button>
            <Button size="lg" onClick={() => nav('/')}>Done</Button>
          </div>
        </Card>
      </Shell>
    )
  }

  if (screen === 'loading') return <Shell><Skeleton className="h-[420px] rounded-3xl" /></Shell>
  if (screen === 'error') return <Shell><LoadError what="your Tax Jar" /></Shell>

  if (!profile.enabled || summary.held === 0) {
    return (
      <Shell>
        <Card className="px-10 py-12 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-canvas text-forest/40">
            <JarIcon className="size-7" />
          </span>
          <h1 className="mt-4 text-[22px] font-bold">Nothing to pay yet</h1>
          <p className="mt-1.5 text-[15px] text-muted">Your Tax Jar is empty. When a client pays you, the tax share lands there.</p>
          <Button variant="secondary" className="mt-6" onClick={() => nav('/tax-jar')}>Back to Tax Jar</Button>
        </Card>
      </Shell>
    )
  }

  const held = summary.reservations.filter((t) => t.reservation!.status === 'reserved')
  const months = [...new Set(held.map((t) => t.createdAt.slice(0, 7)))].sort()
  const span = months.length > 1 ? `${monthShort(months[0])} – ${monthShort(months[months.length - 1])}` : monthShort(months[0])
  const confirm = () => {
    setError(null)
    pay().then(setPaid, (e: Error) => setError(e.message))
  }

  return (
    <Shell>
      <h1 className="text-[32px] font-extrabold tracking-tight text-forest">Pay tax</h1>
      <p className="mt-1 text-[15px] text-muted">Check the details, then confirm. We’ve filled everything in for you.</p>

      <Card className="mt-7 overflow-hidden">
        <div className="bg-forest px-8 py-7 text-white">
          <p className="text-[13px] font-bold tracking-[0.1em] text-lime uppercase">You’re paying</p>
          <p className="num mt-2 text-[52px] leading-none font-extrabold">{formatMoney(summary.held, cur, { cents: true })}</p>
          {summary.nextDeadline && <p className="mt-3 text-sm text-white/70">Due by {formatDate(summary.nextDeadline.toISOString(), true)}</p>}
        </div>
        <dl className="divide-y divide-line px-8">
          <Row k="From">
            <span className="flex items-center gap-2"><JarIcon className="size-4 text-forest" /> Tax Jar</span>
          </Row>
          <Row k="To">{TAX_AUTHORITY}</Row>
          <Row k="Reference">Tax payment</Row>
          <Row k="Covers">{held.length} payment{held.length > 1 ? 's' : ''} from {span}</Row>
          <Row k="Arrives">Today</Row>
        </dl>
        <div className="px-8 pt-2 pb-8">
          {error && (
            <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              <b>Payment didn’t go through.</b> {error}
            </p>
          )}
          <Button size="lg" className="w-full" loading={busy === 'pay'} onClick={confirm}>
            {busy === 'pay' ? 'Paying…' : error ? 'Try again' : `Confirm and pay ${formatMoney(summary.held, cur)}`}
          </Button>
          <Disclaimer className="mt-4 justify-center" />
        </div>
      </Card>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[600px]">
      <Link to="/tax-jar" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        ← Tax Jar
      </Link>
      {children}
    </div>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-4 text-[15px]">
      <dt className="text-muted">{k}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  )
}
