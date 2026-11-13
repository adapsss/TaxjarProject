// In-browser stand-in for the backend pipeline (roadmap section 4, plan decisions 1–5).
// Pure functions over a DB snapshot; the store clones before calling them.
import accountFx from '../../../fixtures/account.json'
import profileFx from '../../../fixtures/tax-profile.json'
import transactionsFx from '../../../fixtures/transactions.json'
import type { Account, Scenario, TaxPart, TaxProfile, Transaction } from './types'

export const DISCLAIMER = 'An estimate for setting money aside, not tax advice.'
export const TAX_AUTHORITY = 'Tax authority (demo)'

const TO_EUR: Record<string, number> = { EUR: 1, USD: 0.92, GBP: 1.15 }
export const fxRate = (from: string, to: string) => Math.round((TO_EUR[from] / TO_EUR[to]) * 10_000) / 10_000

export type Preset = 'filled' | 'empty' | 'not-set-up'

export interface DB {
  profile: TaxProfile
  account: Account
  transactions: Transaction[]
  /** payer name → what the user told us (the classifier's learning, roadmap section 5) */
  payers: Record<string, 'client' | 'personal'>
}

export function seed(preset: Preset): DB {
  const db: DB = {
    profile: structuredClone(profileFx) as TaxProfile,
    account: structuredClone(accountFx) as Account,
    transactions: structuredClone(transactionsFx) as Transaction[],
    payers: {},
  }
  if (preset === 'filled') return db

  // Strip all tax history: give the tax back to the balances it came from, drop the tax payment.
  db.transactions = db.transactions.filter((t) => t.counterparty.name !== TAX_AUTHORITY)
  for (const t of db.transactions) {
    if (t.reservation) credit(db, t.reservation.sourceCurrency, t.reservation.sourceAmount)
    t.reservation = null
    t.reservationId = null
  }
  taxJar(db).balance = 0
  if (preset === 'not-set-up') db.profile.enabled = false
  return db
}

export const taxJar = (db: DB) => db.account.jars.find((j) => j.type === 'tax')!

function credit(db: DB, currency: string, amount: number) {
  const b = db.account.balances.find((x) => x.currency === currency)
  if (b) b.amount += amount
  else db.account.balances.push({ currency, amount })
}

let seq = 0
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`

/** Move the profile's rate of an incoming payment from its balance into the Tax Jar. */
function reserve(db: DB, tx: Transaction) {
  const { rate, taxCurrency } = db.profile
  const sourceAmount = Math.round((tx.amount * rate) / 10_000)
  if (sourceAmount <= 0) return
  const fx = fxRate(tx.currency, taxCurrency)
  const reservedAmount = Math.round(sourceAmount * fx)
  credit(db, tx.currency, -sourceAmount)
  taxJar(db).balance += reservedAmount
  const id = newId('res')
  tx.reservationId = id
  tx.reservation = {
    id, transactionId: tx.id, sourceAmount, sourceCurrency: tx.currency,
    rate, fxRate: fx, reservedAmount, taxCurrency, status: 'reserved',
  }
}

export type Outcome = 'reserved' | 'asked' | 'personal' | 'saved'

export function simulate(db: DB, s: Scenario): { tx: Transaction; outcome: Outcome } {
  const learned = db.payers[s.senderName]
  const classification =
    learned === 'client'
      ? { label: 'income' as const, confidence: 0.99, reasons: ['you said this payer is a client'] }
      : learned === 'personal'
        ? { label: 'personal' as const, confidence: 0.99, reasons: ['you said this payer is personal'] }
        : structuredClone(s.classification)
  const tx: Transaction = {
    id: newId('tx'), direction: 'in', amount: s.amount, currency: s.currency,
    counterparty: { name: s.senderName, kind: s.senderKind, isKnownClient: learned === 'client' },
    reference: s.reference, createdAt: new Date().toISOString(), classification,
    reservationId: null, reservation: null,
  }
  credit(db, tx.currency, tx.amount)
  db.transactions.unshift(tx)

  // Plan decision 4: before onboarding, payments are saved and classified, nothing else.
  if (!db.profile.enabled) return { tx, outcome: 'saved' }
  if (classification.label === 'income') {
    reserve(db, tx)
    return { tx, outcome: tx.reservation ? 'reserved' : 'personal' }
  }
  if (classification.label === 'unknown') return { tx, outcome: 'asked' }
  return { tx, outcome: 'personal' }
}

export function answer(db: DB, id: string, isIncome: boolean): Transaction {
  const tx = find(db, id)
  if (tx.classification.label !== 'unknown') return tx // plan decision 5: repeat taps are harmless
  db.payers[tx.counterparty.name] = isIncome ? 'client' : 'personal'
  tx.counterparty.isKnownClient = isIncome
  tx.classification = isIncome
    ? { label: 'income', confidence: 0.99, reasons: ['you said it was for work'] }
    : { label: 'personal', confidence: 0.99, reasons: ['you said it was personal'] }
  if (isIncome) reserve(db, tx)
  return tx
}

export function undo(db: DB, id: string): Transaction {
  const tx = find(db, id)
  const r = tx.reservation
  if (!r || r.status === 'undone') return tx
  if (r.status === 'paid') throw new Error('This tax has already been paid, so it can’t be undone.')
  r.status = 'undone'
  taxJar(db).balance -= r.reservedAmount
  credit(db, r.sourceCurrency, r.sourceAmount)
  tx.classification = { label: 'personal', confidence: 0.99, reasons: ['you said this wasn’t income'] }
  return tx
}

export function pay(db: DB): number {
  const held = active(db)
  const total = held.reduce((s, t) => s + t.reservation!.reservedAmount, 0)
  if (total <= 0) throw new Error('There’s nothing in your Tax Jar to pay.')
  for (const t of held) t.reservation!.status = 'paid'
  taxJar(db).balance -= total
  db.transactions.unshift({
    id: newId('tx'), direction: 'out', amount: total, currency: db.profile.taxCurrency,
    counterparty: { name: TAX_AUTHORITY, kind: 'company', isKnownClient: false },
    reference: 'Tax payment', createdAt: new Date().toISOString(),
    classification: { label: 'personal', confidence: 0, reasons: [] },
    reservationId: null, reservation: null,
  })
  return total
}

function find(db: DB, id: string) {
  const tx = db.transactions.find((t) => t.id === id)
  if (!tx) throw new Error('That payment no longer exists.')
  return tx
}

const active = (db: DB) => db.transactions.filter((t) => t.reservation?.status === 'reserved')

// ---------- read models ----------

export type Tag = 'Tax set aside' | 'Tax paid' | 'Personal' | 'Needs your answer' | null

export function tagFor(t: Transaction, profileEnabled: boolean): Tag {
  if (t.reservation?.status === 'reserved') return 'Tax set aside'
  if (t.reservation?.status === 'paid') return 'Tax paid'
  if (t.direction !== 'in') return null
  if (t.classification.label === 'unknown') return profileEnabled ? 'Needs your answer' : null
  if (t.classification.label === 'personal') return 'Personal'
  return null
}

export interface MonthBar {
  month: string // YYYY-MM
  held: number
  paid: number
}

export interface Summary {
  currency: string
  held: number
  paid: number
  estimatedDue: number
  nextDeadline: Date | null
  /** Exact split of `held` into its taxes; null when the regime defines none. Comes from the backend. */
  breakdown: TaxPart[] | null
  /** The regime's taxes in words. Comes from the backend. */
  breakdownRule: string
  byMonth: MonthBar[]
  reservations: Transaction[]
  pending: Transaction[]
}

export function summary(db: DB, now = new Date()): Summary {
  const withRes = db.transactions.filter((t) => t.reservation && t.reservation.status !== 'undone')
  const held = withRes.filter((t) => t.reservation!.status === 'reserved').reduce((s, t) => s + t.reservation!.reservedAmount, 0)
  const paid = withRes.filter((t) => t.reservation!.status === 'paid').reduce((s, t) => s + t.reservation!.reservedAmount, 0)

  const byMonth: MonthBar[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    byMonth.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, held: 0, paid: 0 })
  }
  for (const t of withRes) {
    const bar = byMonth.find((b) => t.createdAt.startsWith(b.month))
    if (!bar) continue
    if (t.reservation!.status === 'paid') bar.paid += t.reservation!.reservedAmount
    else bar.held += t.reservation!.reservedAmount
  }

  return {
    currency: db.profile.taxCurrency,
    held,
    paid,
    estimatedDue: held,
    nextDeadline: deadline(db.profile.regime, now),
    breakdown: null,
    breakdownRule: '',
    byMonth,
    reservations: db.transactions.filter((t) => t.reservation),
    pending: db.profile.enabled
      ? db.transactions.filter((t) => t.direction === 'in' && t.classification.label === 'unknown')
      : [],
  }
}

/** Plan decision 7 (placeholders): entrepreneur account monthly on the 10th, FIE quarterly on the 15th. */
function deadline(regime: string, now: Date): Date | null {
  if (regime === 'entrepreneur') {
    const d = new Date(now.getFullYear(), now.getMonth(), 10)
    return d > now ? d : new Date(now.getFullYear(), now.getMonth() + 1, 10)
  }
  if (regime === 'fie') {
    for (const m of [0, 3, 6, 9, 12]) {
      const d = new Date(now.getFullYear(), m, 15)
      if (d > now) return d
    }
  }
  return null
}

export function exportCsv(db: DB): string {
  const rows = [['date', 'payer', 'reference', 'received', 'currency', 'rate_pct', 'fx_rate', 'set_aside', 'tax_currency', 'status']]
  for (const t of db.transactions) {
    const r = t.reservation
    if (!r) continue
    rows.push([
      t.createdAt.slice(0, 10), t.counterparty.name, t.reference, (t.amount / 100).toFixed(2), t.currency,
      String(r.rate / 100), String(r.fxRate), (r.reservedAmount / 100).toFixed(2), r.taxCurrency, r.status,
    ])
  }
  return rows.map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
}
