// Mirrors the frozen API contract (docs/superpowers/plans/2026-11-13-wise-tax-jar.md, Task S0).
// Amounts are integer minor units, rates are basis points (2000 = 20%).

export type Label = 'income' | 'personal' | 'unknown'
export type Kind = 'company' | 'person' | 'unknown'

export interface TaxProfile {
  country: string
  regime: string
  rate: number
  taxCurrency: string
  enabled: boolean
}
export interface Balance {
  currency: string
  amount: number
}
export interface Jar {
  id: string
  name: string
  currency: string
  balance: number
  type: 'tax' | 'regular'
}
export interface Counterparty {
  name: string
  kind: Kind
  isKnownClient: boolean
}
export interface Classification {
  label: Label
  confidence: number
  reasons: string[]
}
export interface TaxReservation {
  id: string
  transactionId: string
  sourceAmount: number
  sourceCurrency: string
  rate: number
  fxRate: number
  reservedAmount: number
  taxCurrency: string
  status: 'reserved' | 'undone' | 'paid'
}
export interface Transaction {
  id: string
  direction: 'in' | 'out'
  amount: number
  currency: string
  counterparty: Counterparty
  reference: string
  createdAt: string
  classification: Classification
  reservationId: string | null
  reservation: TaxReservation | null
}
export interface Account {
  owner: string
  balances: Balance[]
  jars: Jar[]
}
export interface Regime {
  id: string
  name: string
  defaultRate: number
  hint: string
}
export interface Country {
  code: string
  name: string
  regimes: Regime[]
}
export interface Scenario {
  id: string
  label: string
  senderName: string
  senderKind: Kind
  amount: number
  currency: string
  reference: string
  classification: Classification
}
