import { useId, useState } from 'react'
import type { Transaction } from '../api/client'
import { paymentSplit } from '../lib/breakdown'
import { formatMoney, formatRate } from '../lib/money'

const TAX_COLORS = ['bg-forest', 'bg-[#4d7c2a]', 'bg-[#86b35e]']

/**
 * "How is €276 worked out?": a button that opens the exact split of one payment —
 * each tax as a percentage of what arrived, in both currencies, and what stays yours.
 */
export function TaxBreakdown({ tx, rule }: { tx: Transaction; rule?: string }) {
  const [open, setOpen] = useState(false)
  const panel = useId()
  const s = paymentSplit(tx)
  if (!s) return null
  const fx = s.currency !== s.taxCurrency

  return (
    <div className="rounded-[22px] bg-white ring-1 ring-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((v) => !v)}
        className="press flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-[22px] px-4 py-3 text-left"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lime text-[15px] font-extrabold text-forest">%</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">How is {formatMoney(s.total.reserved, s.taxCurrency, { cents: true })} worked out?</span>
          <span className="block text-[13px] text-muted">
            {formatRate(s.total.rateBp)} of this payment{s.exact ? `: ${s.taxes.map((t) => `${formatRate(t.rateBp)} ${t.name.toLowerCase()}`).join(', ')}` : ''}
          </span>
        </span>
        <svg viewBox="0 0 24 24" className={`size-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div id={panel} className="animate-rise px-4 pb-4">
          {/* The whole payment as one bar: each tax and what stays yours, to scale. */}
          <div className="flex h-3 overflow-hidden rounded-full bg-soft" role="img" aria-label={`Of ${formatMoney(s.received, s.currency)}: ${s.taxes.map((t) => `${formatRate(t.rateBp)} ${t.name}`).join(', ')}, ${formatRate(s.keep.rateBp)} yours`}>
            {s.taxes.map((t, i) => (
              <span key={t.id} className={TAX_COLORS[i % TAX_COLORS.length]} style={{ width: `${t.rateBp / 100}%` }} />
            ))}
          </div>

          <table className="mt-4 w-full text-[14px]">
            <caption className="sr-only">Tax taken from this payment</caption>
            <thead>
              <tr className="text-[12px] text-muted">
                <th scope="col" className="pb-1.5 text-left font-medium">Of {formatMoney(s.received, s.currency, { cents: true })}</th>
                <th scope="col" className="pb-1.5 text-right font-medium">Share</th>
                <th scope="col" className="pb-1.5 text-right font-medium">{fx ? s.currency : 'Amount'}</th>
                {fx && <th scope="col" className="pb-1.5 text-right font-medium">{s.taxCurrency}</th>}
              </tr>
            </thead>
            <tbody className="money">
              {s.taxes.map((t, i) => (
                <tr key={t.id} className="border-t border-line/70">
                  <th scope="row" className="py-2.5 text-left font-medium">
                    <span className={`mr-2 inline-block size-2.5 rounded-full align-middle ${TAX_COLORS[i % TAX_COLORS.length]}`} />
                    {t.name}
                  </th>
                  <td className="py-2.5 text-right font-semibold">{formatRate(t.rateBp)}</td>
                  <td className="py-2.5 text-right">{formatMoney(t.source, s.currency, { cents: true })}</td>
                  {fx && <td className="py-2.5 text-right">{formatMoney(t.reserved, s.taxCurrency, { cents: true })}</td>}
                </tr>
              ))}
              <tr className="border-t-2 border-forest/15 font-bold">
                <th scope="row" className="py-2.5 text-left">Set aside</th>
                <td className="py-2.5 text-right">{formatRate(s.total.rateBp)}</td>
                <td className="py-2.5 text-right">{formatMoney(s.total.source, s.currency, { cents: true })}</td>
                {fx && <td className="py-2.5 text-right">{formatMoney(s.total.reserved, s.taxCurrency, { cents: true })}</td>}
              </tr>
              <tr className="border-t border-line/70 text-muted">
                <th scope="row" className="py-2.5 text-left font-medium">
                  <span className="mr-2 inline-block size-2.5 rounded-full bg-soft align-middle ring-1 ring-line" />
                  Yours to keep
                </th>
                <td className="py-2.5 text-right font-semibold">{formatRate(s.keep.rateBp)}</td>
                <td className="py-2.5 text-right">{formatMoney(s.keep.amount, s.currency, { cents: true })}</td>
                {fx && <td />}
              </tr>
            </tbody>
          </table>

          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            {fx && `Converted at 1 ${s.currency} = ${tx.reservation!.fxRate} ${s.taxCurrency} when it arrived. `}
            {s.exact
              ? rule
                ? `The law splits it this way: ${rule}.`
                : 'The split between taxes is fixed by law for this regime.'
              : `${rule ? `${rule}. ` : ''}Your regime splits tax on yearly profit, so the exact amounts are worked out on your return.`}
          </p>
        </div>
      )}
    </div>
  )
}
