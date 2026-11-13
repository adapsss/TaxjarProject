// Typed client for the real backend. Same function names and error type as the
// frozen frontend/src/api/client.ts, so moving these screens there is a copy.
// Vite proxies /api to the backend on :8000 (vite.config.ts).
import type { Account, Country, PayResult, SimulateIncoming, TaxProfile, TaxSummary, Transaction } from './types'

/** Every failed call throws this. `code` is the backend's error code, e.g. "tax_jar_not_empty". */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** Link target for the CSV export; the browser downloads it directly. */
export const EXPORT_CSV_URL = '/api/tax/export.csv'

/** URL for `new EventSource(...)`. */
export const EVENTS_URL = '/api/events'

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json()
    const error = body?.error
    if (error && typeof error.code === 'string' && typeof error.message === 'string') {
      return new ApiError(error.code, error.message, res.status)
    }
  } catch {
    // Not JSON: fall through to the generic error.
  }
  return new ApiError(`http_${res.status}`, res.statusText || `Request failed (${res.status})`, res.status)
}

async function request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('network_error', 'Could not reach the server. Is the backend running on port 8000?', 0)
  }
  if (!res.ok) throw await toApiError(res)
  return (await res.json()) as T
}

const tx = (id: string) => `/transactions/${encodeURIComponent(id)}`

export const getAccount = () => request<Account>('GET', '/account')
export const getTransactions = () => request<Transaction[]>('GET', '/transactions')
export const getTaxProfile = () => request<TaxProfile>('GET', '/tax-profile')
export const putTaxProfile = (profile: TaxProfile) => request<TaxProfile>('PUT', '/tax-profile', profile)
export const getCountries = () => request<Country[]>('GET', '/tax/countries')
export const simulateIncoming = (payment: SimulateIncoming) =>
  request<Transaction>('POST', '/simulate/incoming', payment)
export const answerTransaction = (id: string, isIncome: boolean) =>
  request<Transaction>('POST', `${tx(id)}/answer`, { isIncome })
export const undoTransaction = (id: string) => request<Transaction>('POST', `${tx(id)}/undo`)
export const getTaxSummary = () => request<TaxSummary>('GET', '/tax/summary')
export const payTax = () => request<PayResult>('POST', '/tax/pay')
export const resetDemo = () => request<Account>('POST', '/demo/reset')
