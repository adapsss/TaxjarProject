// Screenshot screens and states with Playwright.
// Usage: node scripts/shoot.mjs [name-filter]   (dev server must be running on :5199)
// Every shot starts on Home, because the demo controls live there; after setting a
// backend state we navigate to the screen being captured.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5199'
const OUT = new URL('../screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const go = (path) => async (p) => {
  await p.goto(BASE + path)
  await p.waitForLoadState('networkidle')
}
const openDemo = async (p) => {
  await p.getByTestId('demo-trigger').click()
  await p.getByRole('dialog', { name: 'Demo controls' }).waitFor()
}
const closeDemo = async (p) => {
  await p.getByRole('button', { name: 'Done' }).click()
  await p.getByRole('dialog', { name: 'Demo controls' }).waitFor({ state: 'hidden' })
}
const preset = (id) => async (p) => {
  await openDemo(p)
  await p.getByTestId(`demo-state-${id}`).click()
  await p.getByRole('dialog', { name: 'Demo controls' }).waitFor({ state: 'hidden' })
  await p.waitForTimeout(600)
}
const sim = (id) => async (p) => {
  await openDemo(p)
  await p.getByTestId(`demo-sim-${id}`).click()
  await p.getByRole('dialog', { name: 'Demo controls' }).waitFor({ state: 'hidden' })
  await p.waitForTimeout(1000)
}
const openRow = (name) => async (p) => {
  await p.locator('[data-tx-id]').filter({ hasText: name }).first().click()
  await p.getByRole('dialog', { name: 'Payment details' }).waitFor()
}
const wait = (ms) => (p) => p.waitForTimeout(ms)

const SHOTS = {
  'home-filled': { steps: [preset('filled')] },
  'home-empty': { steps: [preset('empty')] },
  'home-not-set-up': { steps: [preset('not-set-up')] },
  'home-loading': { steps: [preset('loading')] },
  'home-error': { steps: [preset('error')] },
  'home-toast-acme': { steps: [preset('filled'), sim('acme'), wait(600)] },
  'home-question-john': { steps: [preset('filled'), sim('john')] },
  'home-mari-personal': { steps: [preset('filled'), sim('mari'), wait(300)] },
  'activity': { steps: [preset('filled'), go('/activity')] },
  'activity-pending': {
    steps: [preset('filled'), sim('john'), (p) => p.getByRole('button', { name: 'Decide later' }).click(), go('/activity'), (p) => p.getByRole('tab', { name: /To answer/ }).click()],
  },
  'drawer-fx': { steps: [preset('filled'), sim('acme'), openRow('Acme Inc.')] },
  'drawer-personal': { steps: [preset('filled'), sim('mari'), openRow('Mari Tamm')] },
  'drawer-pending': {
    steps: [preset('filled'), sim('john'), (p) => p.getByRole('button', { name: 'Decide later' }).click(), openRow('John Smith')],
  },
  'drawer-paid': {
    steps: [
      preset('filled'),
      go('/tax-jar/pay'),
      (p) => p.getByRole('button', { name: /Confirm and pay/ }).click(),
      (p) => p.getByRole('button', { name: 'Back to Tax Jar' }).click(),
      (p) => p.waitForTimeout(400),
      (p) => p.locator('main button').filter({ hasText: /Nordwind GmbH[\s\S]*Paid/ }).first().click(),
      (p) => p.getByRole('dialog', { name: 'Payment details' }).waitFor(),
    ],
  },
  'taxjar-filled': { steps: [preset('filled'), go('/tax-jar')] },
  'taxjar-empty': { steps: [preset('empty'), go('/tax-jar')] },
  'taxjar-not-set-up': { steps: [preset('not-set-up'), go('/tax-jar')] },
  'taxjar-loading': { steps: [preset('loading'), go('/tax-jar')] },
  'taxjar-error': { steps: [preset('error'), go('/tax-jar')] },
  'pay-confirm': { steps: [preset('filled'), go('/tax-jar/pay')] },
  'pay-success': {
    steps: [preset('filled'), go('/tax-jar/pay'), (p) => p.getByRole('button', { name: /Confirm and pay/ }).click(), (p) => p.waitForTimeout(1000)],
  },
  'pay-error': {
    steps: [
      preset('filled'),
      openDemo,
      (p) => p.getByRole('switch', { name: 'Next action fails' }).click(),
      closeDemo,
      (p) => p.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tax Jar' }).click(),
      (p) => p.getByRole('button', { name: 'Pay tax' }).click(),
      (p) => p.getByRole('button', { name: /Confirm and pay/ }).click(),
      (p) => p.waitForTimeout(1000),
    ],
  },
  'pay-empty': { steps: [preset('empty'), go('/tax-jar/pay')] },
  'setup-1': { steps: [preset('not-set-up'), go('/setup')] },
  'setup-2': {
    steps: [
      preset('not-set-up'),
      go('/setup'),
      (p) => p.getByRole('radio', { name: 'Estonia', exact: true }).click(),
      (p) => p.getByRole('button', { name: 'Continue' }).click(),
    ],
  },
  'setup-3': {
    steps: [
      preset('not-set-up'),
      go('/setup'),
      (p) => p.getByRole('radio', { name: 'Estonia', exact: true }).click(),
      (p) => p.getByRole('button', { name: 'Continue' }).click(),
      (p) => p.getByRole('radio', { name: /Entrepreneur/ }).click(),
      (p) => p.getByRole('button', { name: 'Continue' }).click(),
    ],
  },
  'settings': { steps: [preset('filled'), go('/setup')] },
  'demo-sheet': { steps: [preset('filled'), openDemo] },
}

const filter = process.argv[2] ?? ''
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors = []
for (const [name, s] of Object.entries(SHOTS)) {
  if (!name.includes(filter)) continue
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
  await page.goto(BASE + '/')
  await page.waitForLoadState('networkidle')
  for (const step of s.steps ?? []) await step(page)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}${name}.png` })
  console.log('shot', name)
  await page.close()
}
await browser.close()
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'))
  process.exitCode = 1
}
