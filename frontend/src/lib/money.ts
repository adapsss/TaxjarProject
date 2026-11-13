const SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }

/** ISO 4217 minor-unit digits, as the backend uses them: JPY 0, EUR 2, KWD 3. */
export function exponent(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2 // not an ISO code
  }
}

/** 27600 EUR → "€276", 27650 → "€276.50", 100000 JPY → "JPY 100,000". `sign` adds "+" to positives; negatives use a real minus. */
export function formatMoney(minor: number, currency: string, opts: { sign?: boolean; cents?: boolean } = {}): string {
  const abs = Math.abs(minor)
  const digits = exponent(currency)
  const unit = 10 ** digits
  const whole = abs % unit === 0 && !opts.cents
  const n = (abs / unit).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : digits,
    maximumFractionDigits: whole ? 0 : digits,
  })
  const prefix = minor < 0 ? '−' : opts.sign && minor > 0 ? '+' : ''
  return `${prefix}${SYMBOL[currency] ?? currency + ' '}${n}`
}

export const symbol = (currency: string) => SYMBOL[currency] ?? currency

/** 2000 → "20%" */
export const formatRate = (bp: number) => `${+(bp / 100).toFixed(2)}%`

/** [{Income tax, 11040}, {Social tax, 16560}] → "€110.40 income tax · €165.60 social tax" */
export function partsLine(parts: { name: string; amount: number }[], currency: string): string {
  return parts.map((p) => `${formatMoney(p.amount, currency, { cents: true })} ${p.name.toLowerCase()}`).join(' · ')
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
