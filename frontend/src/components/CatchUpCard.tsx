import { useState } from 'react'
import { formatMoney } from '../lib/money'
import { useStore } from '../state/store'
import { Button, JarIcon } from './ui'

/**
 * Shown once the Tax Jar is set up while earlier client income has no tax set aside
 * (it arrived before the jar existed). One tap covers all of it.
 */
export function CatchUpCard({ className = '' }: { className?: string }) {
  const { catchUpOffer: offer, catchUp, dismissCatchUp, busy, profile } = useStore()
  const [error, setError] = useState<string | null>(null)
  if (!offer || !profile.enabled) return null

  const year = new Date(`${offer.since}T00:00:00`).getFullYear()
  return (
    <section aria-labelledby="catch-up-title" className={`rounded-[24px] bg-white p-5 ring-2 ring-lime ${className}`}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lime text-forest">
          <JarIcon className="size-5" />
        </span>
        <h2 id="catch-up-title" className="text-[18px] leading-tight font-extrabold tracking-[-0.02em]">
          Catch up on {year} so far?
        </h2>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Clients paid you <b className="money text-ink">{formatMoney(offer.income, offer.taxCurrency)}</b> before your Tax Jar existed ({offer.count}{' '}
        payment{offer.count === 1 ? '' : 's'}). Set aside{' '}
        <b className="money text-ink">{formatMoney(offer.reserved, offer.taxCurrency, { cents: true })}</b> for it now, so nothing surprises you later.
      </p>
      {error && <p role="alert" className="mt-2 text-[14px] text-danger">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button className="flex-1" loading={busy === 'catch-up'} disabled={!!busy} onClick={() => catchUp().catch((e: Error) => setError(e.message))}>
          Set aside {formatMoney(offer.reserved, offer.taxCurrency)}
        </Button>
        <Button variant="ghost" onClick={dismissCatchUp} disabled={busy === 'catch-up'}>
          Not now
        </Button>
      </div>
    </section>
  )
}
