import type { MonthBar } from '../data/engine'
import { formatMoney, monthShort } from '../lib/money'

/** Plain flex bars (no chart library): held in lime, already paid in a muted tone. */
export function MonthlyBars({
  data,
  currency,
  dark,
  height = 120,
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
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => {
          const total = d.held + d.paid
          return (
            <div key={d.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              {showValues && (
                <span className={`num text-[11px] font-semibold ${total ? (dark ? 'text-white/80' : 'text-ink/70') : 'opacity-0'}`}>
                  {formatMoney(total, currency)}
                </span>
              )}
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-lg transition-[height] duration-700 ease-out"
                style={{ height: `${Math.max(total ? 6 : 3, (total / max) * 100)}%` }}
                title={`${monthShort(d.month)}: ${formatMoney(d.held, currency)} set aside, ${formatMoney(d.paid, currency)} paid`}
              >
                {total === 0 ? (
                  <div className={`h-full w-full ${dark ? 'bg-white/10' : 'bg-black/[0.06]'}`} />
                ) : (
                  <>
                    <div className={`${i === last ? 'bg-lime' : dark ? 'bg-lime/75' : 'bg-lime'}`} style={{ height: `${(d.held / total) * 100}%` }} />
                    <div className={dark ? 'bg-white/25' : 'bg-forest/25'} style={{ height: `${(d.paid / total) * 100}%` }} />
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((d, i) => (
          <span
            key={d.month}
            className={`flex-1 text-center text-[11px] ${i === last ? 'font-bold' : ''} ${dark ? (i === last ? 'text-white' : 'text-white/55') : i === last ? 'text-ink' : 'text-muted'}`}
          >
            {monthShort(d.month)}
          </span>
        ))}
      </div>
    </div>
  )
}
