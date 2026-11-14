import { formatMoney, formatRate } from '../lib/money'
import { Spinner } from './ui'

/**
 * The manual choice between the two things that can happen to a payment, side by side in the
 * same two colours everywhere: green with the jar = tax is set aside, grey = no tax is taken.
 * Each button says what it does in money, so nobody has to guess what "work" means.
 */
export function WorkChoice({
  amount,
  currency,
  rate,
  busy,
  disabled,
  compact,
  onChoose,
}: {
  amount: number
  currency: string
  /** Basis points. */
  rate: number
  /** Which answer is being sent right now, if any. */
  busy: boolean | null
  disabled?: boolean
  /** Two short side-by-side buttons for a feed row, instead of the two big ones of the payment sheet. */
  compact?: boolean
  onChoose: (isIncome: boolean) => void
}) {
  const tax = formatMoney(Math.round((amount * rate) / 10_000), currency)
  if (compact) {
    return (
      <div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChoose(true)}
            className="press flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-lime px-3 text-[14px] font-bold text-forest disabled:cursor-wait disabled:opacity-60"
          >
            {busy === true ? <Spinner className="size-3.5" /> : <JarMark />}
            <span className="truncate">For work</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChoose(false)}
            className="press flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-3 text-[14px] font-bold text-ink ring-1 ring-inset ring-line disabled:cursor-wait disabled:opacity-60"
          >
            {busy === false && <Spinner className="size-3.5" />}
            <span className="truncate">Personal</span>
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-muted">
          For work: {tax} ({formatRate(rate)}) goes to your Tax Jar. Personal: no tax.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChoose(true)}
        className="press flex min-h-[64px] w-full cursor-pointer items-center gap-3 rounded-[22px] bg-lime px-4 py-3 text-left text-forest disabled:cursor-wait disabled:opacity-60"
      >
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-forest text-lime">
          {busy === true ? <Spinner /> : <JarMark />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold">Yes, it’s for work</span>
          <span className="block text-[14px] text-forest/75">Tax: {tax} ({formatRate(rate)}) goes to your Tax Jar</span>
        </span>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChoose(false)}
        className="press flex min-h-[64px] w-full cursor-pointer items-center gap-3 rounded-[22px] bg-white px-4 py-3 text-left ring-1 ring-inset ring-line disabled:cursor-wait disabled:opacity-60"
      >
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-soft text-[18px] font-bold text-muted">
          {busy === false ? <Spinner /> : '–'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold">No, it’s personal</span>
          <span className="block text-[14px] text-muted">No tax: the whole {formatMoney(amount, currency)} stays yours</span>
        </span>
      </button>
    </div>
  )
}

function JarMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3.5h8M9 3.5v2.3C6.9 6.8 5.8 8.5 5.8 11v6.2c0 1.8 1.4 3.3 3.2 3.3h6c1.8 0 3.2-1.5 3.2-3.3V11c0-2.5-1.1-4.2-3.2-5.2V3.5" />
    </svg>
  )
}
