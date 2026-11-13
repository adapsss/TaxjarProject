import { expect, it } from 'vitest'
import { exponent, formatDate, formatMoney, formatRate, monthShort, partsLine } from './money'

it('formats minor units, dropping .00 on whole amounts', () => {
  expect(formatMoney(27600, 'EUR')).toBe('€276')
  expect(formatMoney(27650, 'EUR')).toBe('€276.50')
  expect(formatMoney(150000, 'USD')).toBe('$1,500')
  expect(formatMoney(2300, 'EUR')).toBe('€23')
  expect(formatMoney(90000, 'GBP')).toBe('£900')
})

it('can force cents and show a sign', () => {
  expect(formatMoney(27600, 'EUR', { cents: true })).toBe('€276.00')
  expect(formatMoney(40000, 'EUR', { sign: true })).toBe('+€400')
  expect(formatMoney(-6420, 'EUR', { sign: true, cents: true })).toBe('−€64.20')
  expect(formatMoney(0, 'EUR', { sign: true })).toBe('€0')
})

it('falls back to the currency code when it has no symbol', () => {
  expect(formatMoney(1000, 'SEK')).toBe('SEK 10')
})

it('formats rates, dates and months', () => {
  expect(formatRate(2000)).toBe('20%')
  expect(formatRate(2250)).toBe('22.5%')
  expect(formatDate('2026-12-10T00:00:00', true)).toBe('10 Dec 2026')
  expect(monthShort('2026-08')).toBe('Aug')
})

it('writes a tax split as one line', () => {
  const parts = [{ name: 'Income tax', amount: 11040 }, { name: 'Social tax', amount: 16560 }]
  expect(partsLine(parts, 'EUR')).toBe('€110.40 income tax · €165.60 social tax')
})

it('respects currencies with no or three minor units', () => {
  expect(exponent('JPY')).toBe(0)
  expect(exponent('KWD')).toBe(3)
  expect(exponent('EUR')).toBe(2)
  expect(formatMoney(100000, 'JPY')).toBe('JPY 100,000')
  expect(formatMoney(1250, 'KWD', { cents: true })).toBe('KWD 1.250')
  expect(formatMoney(23200, 'PLN')).toBe('PLN 232')
})
