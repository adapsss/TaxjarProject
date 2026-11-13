import type { TaxLine } from '../lib/breakdown'
import { formatMoney } from '../lib/money'
import { TAX_COLORS } from './taxColors'

/**
 * "What your tax pays for": one row per tax, identical in every country.
 * The amount is exact money where the law fixes a split, "On your return" where it does not.
 */
export function TaxLines({ lines, currency, className = '' }: { lines: TaxLine[]; currency: string; className?: string }) {
  if (lines.length === 0) return null
  return (
    <ul className={`divide-y divide-line/70 ${className}`}>
      {lines.map((l, i) => (
        <li key={l.id} className="flex items-center gap-3 py-3">
          <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${TAX_COLORS[i % TAX_COLORS.length]}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">{l.name}</p>
            <p className="text-[13px] text-muted">{l.basis}</p>
          </div>
          {l.amount !== undefined ? (
            <span className="money shrink-0 text-[16px] font-bold">{formatMoney(l.amount, currency, { cents: true })}</span>
          ) : (
            <span className="shrink-0 text-[14px] text-muted">On your return</span>
          )}
        </li>
      ))}
    </ul>
  )
}
