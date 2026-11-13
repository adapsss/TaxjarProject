import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, answerTransaction, getAccount, putTaxProfile, simulateIncoming } from './client.ts'

function mockFetch(status: number, body: unknown, statusText = '') {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status, statusText }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('GETs same-origin /api paths and returns the JSON body', async () => {
    const fetchMock = mockFetch(200, { owner: 'Kadri Saar', balances: [], jars: [] })
    const account = await getAccount()
    expect(account.owner).toBe('Kadri Saar')
    expect(fetchMock).toHaveBeenCalledWith('/api/account', expect.objectContaining({ method: 'GET' }))
  })

  it('sends camelCase JSON bodies', async () => {
    const fetchMock = mockFetch(200, {})
    await simulateIncoming({ senderName: 'Acme Inc.', amount: 150000, currency: 'USD', reference: 'INV-042' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/simulate/incoming')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      senderName: 'Acme Inc.',
      amount: 150000,
      currency: 'USD',
      reference: 'INV-042',
    })
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('URL-encodes the transaction id', async () => {
    const fetchMock = mockFetch(200, {})
    await answerTransaction('a/b c', true)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/transactions/a%2Fb%20c/answer')
  })

  it('throws ApiError with the code and message from the error format', async () => {
    mockFetch(409, { error: { code: 'tax_jar_not_empty', message: 'Empty the Tax Jar first.' } })
    const error = await putTaxProfile({
      country: 'EE',
      regime: 'entrepreneur_account',
      rate: 2000,
      taxCurrency: 'USD',
      enabled: true,
    }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('tax_jar_not_empty')
    expect(error.message).toBe('Empty the Tax Jar first.')
    expect(error.status).toBe(409)
  })

  it('falls back to an http_<status> code when the body is not in the error format', async () => {
    mockFetch(422, { detail: [{ msg: 'field required' }] }, 'Unprocessable Entity')
    const error = await getAccount().catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('http_422')
    expect(error.status).toBe(422)
  })

  it('turns a network failure into ApiError network_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const error = await getAccount().catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('network_error')
  })
})
