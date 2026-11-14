import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { formatMoney } from '../lib/money'
import { CountUp } from './CountUp'
import { BarsIcon, Button, Disclaimer, EyeIcon, JarIcon } from './ui'

/** The top of Home: the one number the product is about, and what you can do with it. */
export function TaxJarPanel() {
  const { profile, summary, flash } = useStore()
  const nav = useNavigate()
  const [hidden, setHidden] = useState(false)

  if (!profile.enabled) {
    return (
      <section data-testid="tax-jar-panel" className="rounded-[32px] bg-surface p-6">
        <span className="grid size-12 place-items-center rounded-full bg-lime text-forest">
          <JarIcon className="size-6" />
        </span>
        <h2 className="display mt-6 text-[46px]">Never be surprised by a tax bill</h2>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">
          When a client pays you, we move your tax share into a Tax Jar. Payments from friends stay untouched.
        </p>
        <Button size="lg" className="mt-6 w-full" onClick={() => nav('/onboarding')}>
          Set up in 3 steps
        </Button>
        <Disclaimer className="mt-4" />
      </section>
    )
  }

  return (
    <section data-testid="tax-jar-panel">
      <p className="text-[16px] text-muted">Set aside for taxes</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4">
        {hidden ? (
          <span className="num text-[44px] leading-[1.1] font-semibold tracking-[-0.04em] whitespace-nowrap" aria-label="Amount hidden">••••</span>
        ) : (
          <CountUp value={summary.held} currency={summary.currency} className="text-[44px] leading-[1.1] font-semibold whitespace-nowrap" />
        )}
        <button
          type="button"
          aria-label={hidden ? 'Show amount' : 'Hide amount'}
          aria-pressed={hidden}
          onClick={() => setHidden((v) => !v)}
          className="press -mx-1 grid size-11 cursor-pointer place-items-center rounded-full text-accent"
        >
          <EyeIcon className="size-6" off={hidden} />
        </button>
        <Link to="/tax-jar" aria-label="Tax Jar details" className="press -mx-1 grid size-11 place-items-center rounded-full text-accent">
          <BarsIcon className="size-6" />
        </Link>
        {flash && (
          <span key={flash.key} className="money animate-pop rounded-full bg-lime px-2.5 py-1 text-[13px] font-bold text-forest">
            +{formatMoney(flash.amount, summary.currency)}
          </span>
        )}
      </div>
      <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5">
        <Button onClick={() => nav('/tax-jar/pay')} disabled={summary.held === 0}>
          Pay tax
        </Button>
        <Button variant="secondary" onClick={() => nav('/tax-jar')}>
          Details
        </Button>
        <Button variant="secondary" onClick={() => nav('/activity')}>
          Payments
        </Button>
      </div>
    </section>
  )
}
