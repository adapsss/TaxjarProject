const SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }

/** 27600 EUR → "€276", 27650 → "€276.50". `sign` adds "+" to positives; negatives use a real minus. */
export function formatMoney(minor: number, currency: string, opts: { sign?: boolean; cents?: boolean } = {}): string {
  const abs = Math.abs(minor)
  const whole = abs % 100 === 0 && !opts.cents
  const n = (abs / 100).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
  const prefix = minor < 0 ? '−' : opts.sign && minor > 0 ? '+' : ''
  return `${prefix}${SYMBOL[currency] ?? currency + ' '}${n}`
}

export const symbol = (currency: string) => SYMBOL[currency] ?? currency

/** 2000 → "20%" */
export const formatRate = (bp: number) => `${+(bp / 100).toFixed(2)}%`

export function whyLine(reasons: string[]): string {
  return reasons.length ? `Why: ${reasons.join(' · ')}` : ''
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDate(iso: string, withYear = false): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`
}

export function relativeDay(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const days = Math.floor((startOf(now) - startOf(d)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return formatDate(iso)
}
const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export const monthShort = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1]
