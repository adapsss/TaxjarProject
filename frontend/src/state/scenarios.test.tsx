import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const two = [
  { id: 'acme', label: 'Client pays $1,500 (Acme Inc.)', senderName: 'Acme Inc.', senderKind: null, amount: 150000, currency: 'USD', reference: 'INV-042', expect: 'income' },
  { id: 'mari', label: 'Friend sends €23 (Mari Tamm)', senderName: 'Mari Tamm', senderKind: 'person', amount: 2300, currency: 'EUR', reference: 'pizza', expect: 'personal' },
]

beforeEach(() => vi.resetModules())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderList() {
  const { useScenarios } = await import('./scenarios')
  function List() {
    const { scenarios, loading, error } = useScenarios()
    if (loading) return <p>loading</p>
    if (error) return <p role="alert">{error}</p>
    return <ul>{scenarios.map((s) => <li key={s.id}>{s.label}</li>)}</ul>
  }
  render(<List />)
}

it('loads the demo scenarios from the API, in order', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(two)))
  vi.stubGlobal('fetch', fetchMock)
  await renderList()
  await waitFor(() => expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([two[0].label, two[1].label]))
  expect(fetchMock).toHaveBeenCalledWith('/api/demo/scenarios', expect.anything())
})

it('reports an error and no scenarios when the API fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
  await renderList()
  expect((await screen.findByRole('alert')).textContent).toBe('Could not reach the server.')
})

it('shares one request between callers', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(two)))
  vi.stubGlobal('fetch', fetchMock)
  const { loadScenarios } = await import('./scenarios')
  const [a, b] = await Promise.all([loadScenarios(), loadScenarios()])
  expect(a).toBe(b)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
