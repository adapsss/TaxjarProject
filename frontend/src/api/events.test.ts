import { expect, it } from 'vitest'
import { parseEvent } from './events'

const transaction = { id: 't1', direction: 'in', amount: 150000, currency: 'USD' }

it('parses a reservation.created frame into a typed event', () => {
  const e = parseEvent('reservation.created', JSON.stringify({ transaction }))
  expect(e).toEqual({ type: 'reservation.created', transaction })
})

it('parses demo.reset, which has no transaction', () => {
  expect(parseEvent('demo.reset', '{}')).toEqual({ type: 'demo.reset' })
})

it('returns null for unknown types, bad JSON and frames without a transaction', () => {
  expect(parseEvent('something.else', JSON.stringify({ transaction }))).toBeNull()
  expect(parseEvent('reservation.created', '{not json')).toBeNull()
  expect(parseEvent('question.asked', '{}')).toBeNull()
  expect(parseEvent('question.asked', 'null')).toBeNull()
})
