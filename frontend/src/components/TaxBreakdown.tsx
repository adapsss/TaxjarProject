import { useId, useState } from 'react'
import type { Transaction } from '../api/client'
import { paymentLines, paymentSplit } from '../lib/breakdown'
import { formatMoney, formatRate } from '../lib/money'
import { TAX_COLORS } from './taxColors'

/**
 * "How is €276 worked out?": a button that opens the split of one payment: each tax, what was
 * set aside in both currencies, and what stays yours. The layout is the same in every country;
 * only the amount cell differs ("On your return" where the law fixes no per-payment split).
 */
export function TaxBreakdown({ tx, rule }: { tx: Transaction; rule?: string }) {
  const [open, setOpen] = useState(false)
  const panel = useId()
  const s = paymentSplit(tx)
  if (!s) return null
  const lines = paymentLines(tx, rule)
  const fx = s.currency !== s.taxCurrency
  // The bar: each tax to scale when the split is exact, one tax segment otherwise.
  const segments = s.exact ? s.taxes.map((t) => ({ id: t.id, name: t.name, rateBp: t.rateBp })) : [{ id: 'tax', name: 'Tax', rateBp: s.total.rateBp }]

  return (
    <div className="rounded-[22px] bg-surface ring-1 ring-line">
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
            {formatRate(s.total.rateBp)} of this payment · {lines.map((l) => l.name.toLowerCase()).join(' + ')}
          </span>
        </span>
        <svg viewBox="0 0 24 24" className={`size-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div id={panel} className="animate-rise px-4 pb-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-soft" role="img" aria-label={`Of ${formatMoney(s.received, s.currency)}: ${formatRate(s.total.rateBp)} set aside for tax, ${formatRate(s.keep.rateBp)} yours`}>
            {segments.map((t, i) => (
              <span key={t.id} className={TAX_COLORS[i % TAX_COLORS.length]} style={{ width: `${t.rateBp / 100}%` }} />
            ))}
          </div>

          <table className="mt-4 w-full text-[14px]">
            <caption className="sr-only">Tax taken from this payment</caption>
            <thead>
              <tr className="text-[12px] text-muted">
                <th scope="col" className="pb-1.5 text-left font-medium">Of {formatMoney(s.received, s.currency, { cents: true })}</th>
                <th scope="col" className="pb-1.5 text-right font-medium">{fx ? s.currency : 'Amount'}</th>
                {fx && <th scope="col" className="pb-1.5 text-right font-medium">{s.taxCurrency}</th>}
              </tr>
            </thead>
            <tbody className="money">
              {lines.map((l, i) => {
                const exact = s.taxes.find((t) => t.id === l.id)
                return (
                  <tr key={l.id} className="border-t border-line/70">
                    <th scope="row" className="py-2.5 text-left font-medium">
                      <span className={`mr-2 inline-block size-2.5 rounded-full align-middle ${TAX_COLORS[i % TAX_COLORS.length]}`} />
                      {l.name}
                      <span className="block pl-[18px] text-[12.5px] font-normal text-muted">{l.basis}</span>
                    </th>
                    {exact ? (
                      <>
                        <td className="py-2.5 text-right">{formatMoney(exact.source, s.currency, { cents: true })}</td>
                        {fx && <td className="py-2.5 text-right">{formatMoney(exact.reserved, s.taxCurrency, { cents: true })}</td>}
                      </>
                    ) : (
                      <td colSpan={fx ? 2 : 1} className="py-2.5 text-right font-sans text-[13px] text-muted">On your return</td>
                    )}
                  </tr>
                )
              })}
              <tr className="border-t-2 border-accent/15 font-bold">
                <th scope="row" className="py-2.5 text-left">
                  Set aside
                  <span className="block text-[12.5px] font-normal text-muted">{formatRate(s.total.rateBp)} of this payment</span>
                </th>
                <td className="py-2.5 text-right">{formatMoney(s.total.source, s.currency, { cents: true })}</td>
                {fx && <td className="py-2.5 text-right">{formatMoney(s.total.reserved, s.taxCurrency, { cents: true })}</td>}
              </tr>
              <tr className="border-t border-line/70 text-muted">
                <th scope="row" className="py-2.5 text-left font-medium">
                  <span className="mr-2 inline-block size-2.5 rounded-full bg-soft align-middle ring-1 ring-line" />
                  Yours to keep
                  <span className="block pl-[18px] text-[12.5px] font-normal">{formatRate(s.keep.rateBp)} of this payment</span>
                </th>
                <td className="py-2.5 text-right">{formatMoney(s.keep.amount, s.currency, { cents: true })}</td>
                {fx && <td />}
              </tr>
            </tbody>
          </table>

          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            {fx && `Converted at 1 ${s.currency} = ${tx.reservation!.fxRate} ${s.taxCurrency} when it arrived. `}
            {s.exact
              ? 'The law fixes this split for your regime, so these are exact.'
              : 'Your regime taxes yearly profit, so what each tax comes to is worked out on your return.'}
          </p>
        </div>
      )}
    </div>
  )
}
