import type { MonthBar } from '../lib/taxjar'
import { formatMoney, monthShort } from '../lib/money'

/** Plain flex bars (no chart library), rounded the way the Wise app draws charts. */
export function MonthlyBars({
  data,
  currency,
  dark,
  height = 132,
  showValues,
}: {
  data: MonthBar[]
  currency: string
  dark?: boolean
  height?: number
  showValues?: boolean
}) {
  const max = Math.max(1, ...data.map((d) => d.held + d.paid))
  const last = data.length - 1
  return (
    <div>
      <div className="flex items-end gap-2.5" style={{ height }}>
        {data.map((d, i) => {
          const total = d.held + d.paid
          return (
            <div key={d.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              {showValues && (
                <span className={`money text-[12px] font-semibold ${total ? (dark ? 'text-forest/70' : 'text-ink/55') : 'opacity-0'}`}>
                  {formatMoney(total, currency)}
                </span>
              )}
              <div
                className={`flex w-full max-w-[34px] flex-col justify-end overflow-hidden rounded-full ${dark ? 'bg-forest/10' : 'bg-soft'}`}
                style={{ height: `${Math.max(total ? 8 : 4, (total / max) * 100)}%` }}
                title={`${monthShort(d.month)}: ${formatMoney(d.held, currency)} set aside, ${formatMoney(d.paid, currency)} paid`}
              >
                {total === 0 ? null : (
                  <>
                    <div className={`${i === last ? 'bg-lime' : dark ? 'bg-forest/70' : 'bg-ink/25'}`} style={{ height: `${(d.held / total) * 100}%` }} />
                    <div className={dark ? 'bg-forest' : 'bg-forest/80'} style={{ height: `${(d.paid / total) * 100}%` }} />
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2.5 flex gap-2.5">
        {data.map((d, i) => (
          <span
            key={d.month}
            className={`flex-1 text-center text-[12px] ${i === last ? 'font-bold' : 'font-medium'} ${
              dark ? (i === last ? 'text-accent' : 'text-forest/55') : i === last ? 'text-ink' : 'text-muted'
            }`}
          >
            {monthShort(d.month)}
          </span>
        ))}
      </div>
    </div>
  )
}
