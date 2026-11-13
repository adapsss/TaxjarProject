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
    <section aria-labelledby="catch-up-title" className={`rounded-3xl border-2 border-lime bg-lime-soft p-5 ${className}`}>
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lime text-forest">
          <JarIcon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="catch-up-title" className="text-[17px] leading-snug font-bold text-forest">
            Catch up on {year} so far?
          </h2>
          <p className="mt-1 text-[14.5px] leading-relaxed text-forest/80">
            Clients paid you <b className="num">{formatMoney(offer.income, offer.taxCurrency)}</b> before your Tax Jar existed
            ({offer.count} payment{offer.count === 1 ? '' : 's'}). Set aside{' '}
            <b className="num">{formatMoney(offer.reserved, offer.taxCurrency, { cents: true })}</b> for it now, so nothing surprises you later.
          </p>
          {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button loading={busy === 'catch-up'} disabled={!!busy} onClick={() => catchUp().catch((e: Error) => setError(e.message))}>
              Set aside {formatMoney(offer.reserved, offer.taxCurrency)}
            </Button>
            <Button variant="ghost" onClick={dismissCatchUp} disabled={busy === 'catch-up'}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
