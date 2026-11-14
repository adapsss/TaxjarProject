// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import PayTax from '../screens/PayTax.tsx'
import { acme, stubApi } from '../test/fakeApi.ts'
import { StoreProvider, useStore } from './store.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

type Listener = (m: { data: string }) => void

/** An EventSource the test drives by hand. */
function stubEvents() {
  const listeners: Record<string, Listener[]> = {}
  vi.stubGlobal(
    'EventSource',
    class {
      addEventListener(type: string, fn: Listener) {
        ;(listeners[type] ??= []).push(fn)
      }
      close() {}
    },
  )
  return (type: string, data: unknown = {}) => listeners[type]?.forEach((fn) => fn({ data: JSON.stringify(data) }))
}

function Probe() {
  const { screen: state, transactions } = useStore()
  return <p>{state === 'ready' ? `ready:${transactions.length}` : state}</p>
}

const renderStore = (child = <Probe />) =>
  render(
    <MemoryRouter>
      <StoreProvider>{child}</StoreProvider>
    </MemoryRouter>,
  )

const listLoads = (calls: { url: string }[]) => calls.filter((c) => c.url === '/api/transactions').length

it('answers a burst of live events with one more refresh, not one per event', async () => {
  const calls = stubApi(true)
  const emit = stubEvents()
  renderStore()
  await screen.findByText('ready:1')
  const before = listLoads(calls)

  act(() => {
    for (let i = 0; i < 10; i++) emit('reservation.created', { transaction: { ...acme, id: `burst-${i}` } })
  })
  // Each event's payment is on screen at once, without waiting for any refresh.
  expect(screen.getByText('ready:11')).toBeTruthy()

  await waitFor(() => expect(listLoads(calls)).toBeGreaterThan(before))
  await act(() => new Promise((r) => setTimeout(r, 50)))
  // One refresh started with the first event, and one more covers the nine that came while it ran.
  expect(listLoads(calls) - before).toBeLessThanOrEqual(2)
})

it('reads everything again when the server says this tab fell behind', async () => {
  const calls = stubApi(true)
  const emit = stubEvents()
  renderStore()
  await screen.findByText('ready:1')
  const before = listLoads(calls)
  act(() => emit('resync'))
  await waitFor(() => expect(listLoads(calls)).toBe(before + 1))
})

it('PayTax still draws when money is held but no reserved payment is loaded', async () => {
  // What another tab's undo leaves behind for a moment: the server total is stale, the list is not.
  stubApi(true, [{ ...acme, reservation: { ...acme.reservation, status: 'undone' } }])
  stubEvents()
  renderStore(<PayTax />)
  expect(await screen.findByText('Everything set aside so far')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Confirm and pay/ })).toBeTruthy()
})

it('does not let a refresh that started before an event take that event’s payment off the screen', async () => {
  stubApi(true)
  const emit = stubEvents()
  renderStore()
  await screen.findByText('ready:1')

  // Hold back the next two list answers, to decide when each refresh comes back.
  const realFetch = globalThis.fetch
  const gates: (() => void)[] = []
  let toHold = 2
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/transactions' && toHold > 0) {
      toHold -= 1
      await new Promise<void>((open) => gates.push(open))
    }
    return realFetch(url, init)
  })
  const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 30)))

  act(() => emit('transaction.created', { transaction: { ...acme, id: 'first' } })) // starts the first refresh
  await settle()
  act(() => emit('reservation.created', { transaction: { ...acme, id: 'second' } })) // arrives while it runs
  expect(screen.getByText('ready:3')).toBeTruthy()

  gates[0]() // the first refresh answers: it read the backend before the second event (1 payment)
  await settle()
  // Its list is shown, with the second event's payment kept on top; the first event's payment is
  // not kept, because that refresh started after it and so speaks for it.
  expect(screen.getByText('ready:2')).toBeTruthy()

  gates[1]() // the follow-up refresh started after the second event, so its list is the whole truth
  await settle()
  expect(screen.getByText('ready:1')).toBeTruthy()
})

it('shows the first load even when the event stream opens before it has answered', async () => {
  const calls = stubApi(true)
  const emit = stubEvents()
  const realFetch = globalThis.fetch
  let lists = 0
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/transactions') {
      lists += 1
      if (lists === 1) await new Promise((r) => setTimeout(r, 60)) // the first load is slow
      else return new Response('{}', { status: 503 }) // and every later refresh fails
    }
    return realFetch(url, init)
  })
  renderStore()
  act(() => emit('open')) // the stream connects while the first load is still on its way
  expect(await screen.findByText('ready:1')).toBeTruthy() // not "ready" with nothing in it
  expect(listLoads(calls)).toBeGreaterThan(0)
})
