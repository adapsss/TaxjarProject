import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  Button,
  Card,
  CheckIcon,
  CircleButton,
  Disclaimer,
  JarIcon,
  ScreenTitle,
} from '../components/ui'
import { TAX_AUTHORITY } from '../lib/taxjar'
import { useStore } from '../state/store'
import { formatDate, formatMoney, monthShort } from '../lib/money'

export default function PayTax() {
  const { summary, pay, busy, profile } = useStore()
  const nav = useNavigate()
  const [paid, setPaid] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cur = summary.currency

  if (paid !== null) {
    return (
      <Shell>
        <Card className="animate-rise px-6 pt-10 pb-8 text-center">
          <span className="mx-auto grid size-[76px] animate-check-pop place-items-center rounded-full bg-lime text-forest">
            <CheckIcon className="size-9" />
          </span>
          <p className="money mt-6 text-[42px] leading-none font-extrabold tracking-[-0.05em]">{formatMoney(paid, cur, { cents: true })}</p>
          <h1 className="mt-2 text-[18px] font-bold">paid to {TAX_AUTHORITY}</h1>
          <p className="mx-auto mt-2 max-w-[300px] text-[14px] leading-relaxed text-muted">
            Your Tax Jar is empty now. It starts filling again with your next client payment.
          </p>
          <div className="mt-7 space-y-2">
            <Button size="lg" className="w-full" onClick={() => nav('/')}>
              Done
            </Button>
            <Button variant="secondary" size="lg" className="w-full" onClick={() => nav('/tax-jar')}>
              Back to Tax Jar
            </Button>
          </div>
        </Card>
      </Shell>
    )
  }

  if (!profile.enabled || summary.held === 0) {
    return (
      <Shell>
        <Card className="px-6 py-10 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-soft text-muted">
            <JarIcon className="size-7" />
          </span>
          <h1 className="mt-4 text-[20px] font-extrabold tracking-[-0.03em]">Nothing to pay yet</h1>
          <p className="mx-auto mt-1.5 max-w-[270px] text-[14px] leading-relaxed text-muted">
            Your Tax Jar is empty. When a client pays you, the tax share lands there.
          </p>
          <Button variant="secondary" className="mt-6" onClick={() => nav('/tax-jar')}>
            Back to Tax Jar
          </Button>
        </Card>
      </Shell>
    )
  }

  const held = summary.reservations.filter((t) => t.reservation!.status === 'reserved')
  const months = [...new Set(held.map((t) => t.createdAt.slice(0, 7)))].sort()
  // The total comes from the server and the list from the loaded payments: for a moment after an
  // undo in another tab (or past the list's size limit) there is money held and no payment to name.
  const first = months[0]
  const last = months[months.length - 1]
  const span = first === undefined ? null : first === last ? monthShort(first) : `${monthShort(first)} – ${monthShort(last)}`
  const confirm = () => {
    setError(null)
    pay().then(setPaid, (e: Error) => setError(e.message))
  }

  return (
    <div className="flex min-h-full flex-col px-5 pt-2">
      <header className="flex items-center justify-between">
        <CircleButton label="Back to Tax Jar" size={40} onClick={() => nav('/tax-jar')}>
          <ArrowLeftIcon className="size-[18px]" />
        </CircleButton>
        <span className="flex items-center gap-1.5 rounded-full bg-soft px-2.5 py-1 text-[13px] font-semibold text-muted">
          <span className="size-1.5 rounded-full bg-lime" /> Demo payment
        </span>
      </header>

      <div className="mt-4 animate-rise">
        <ScreenTitle>Pay tax</ScreenTitle>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">Check the details, then confirm. We’ve filled everything in for you.</p>

        <Card className="mt-5 overflow-hidden">
          <div className="px-5 pt-6 pb-5 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-full bg-lime text-forest">
              <JarIcon className="size-5" />
            </span>
            <p className="mt-2.5 text-[13px] font-medium text-muted">You’re paying</p>
            <p className="money mt-1 text-[46px] leading-none font-extrabold tracking-[-0.05em]">{formatMoney(summary.held, cur, { cents: true })}</p>
            {summary.nextDeadline && (
              <p className="mt-2 text-[13px] text-muted">Due by {formatDate(summary.nextDeadline.toISOString(), true)}</p>
            )}
          </div>
          <dl className="border-t border-line/70 px-5">
            <Row k="From">
              <span className="flex items-center gap-1.5">
                <JarIcon className="size-3.5 text-accent" /> Tax Jar
              </span>
            </Row>
            <Row k="To">{TAX_AUTHORITY}</Row>
            <Row k="Reference">Tax payment</Row>
            <Row k="Covers">
              {span === null ? 'Everything set aside so far' : `${held.length} payment${held.length > 1 ? 's' : ''} from ${span}`}
            </Row>
            <Row k="Arrives" last>
              Today
            </Row>
          </dl>
        </Card>

        {error && (
          <p role="alert" className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] leading-relaxed text-danger">
            <b>Payment didn’t go through.</b> {error}
          </p>
        )}
        <Disclaimer className="mt-4 px-1" />
      </div>

      <div className="sticky-footer mt-auto">
        <Button size="lg" className="w-full" loading={busy === 'pay'} onClick={confirm}>
          {busy === 'pay' ? 'Paying…' : error ? 'Try again' : `Confirm and pay ${formatMoney(summary.held, cur)}`}
        </Button>
      </div>
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="px-5 pt-2 pb-8">{children}</div>
}

function Row({ k, children, last }: { k: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3.5 text-[14px] ${last ? '' : 'border-b border-line/60'}`}>
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  )
}
