// Screenshot screens and states with Playwright.
// Usage: node scripts/shoot.mjs [name-filter]   (dev server must be running on :5199)
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5199'
const OUT = new URL('../screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const preset = (label) => async (p) => {
  await p.locator('aside select').selectOption({ label })
  await p.waitForTimeout(300)
}
const sim = (name) => async (p) => {
  await p.getByRole('button', { name: new RegExp(name) }).first().click()
}

const SHOTS = {
  'home-filled': { url: '/' },
  'home-not-set-up': { url: '/', steps: [preset('Not set up')] },
  'home-loading': { url: '/', steps: [preset('Loading')] },
  'home-error': { url: '/', steps: [preset('Error')] },
  'home-toast-acme': { url: '/', steps: [sim('Acme'), (p) => p.waitForTimeout(1500)] },
  'home-question-john': { url: '/', steps: [sim('John'), (p) => p.waitForTimeout(900)] },
  'home-mari-personal': { url: '/', steps: [sim('Mari'), (p) => p.waitForTimeout(1200)] },
  'drawer-fx': { url: '/?tx=tx-northwind' },
  'drawer-paid': { url: '/?tx=tx-fjord' },
  'drawer-pending': { url: '/?tx=tx-kristjan' },
  'taxjar-filled': { url: '/tax-jar', full: true },
  'taxjar-empty': { url: '/tax-jar', steps: [preset('Empty')], full: true },
  'taxjar-not-set-up': { url: '/tax-jar', steps: [preset('Not set up')] },
  'taxjar-loading': { url: '/tax-jar', steps: [preset('Loading')] },
  'taxjar-error': { url: '/tax-jar', steps: [preset('Error')] },
  'pay-confirm': { url: '/tax-jar/pay' },
  'pay-success': { url: '/tax-jar/pay', steps: [(p) => p.getByRole('button', { name: /Confirm/ }).click(), (p) => p.waitForTimeout(1200)] },
  'pay-error': {
    url: '/tax-jar/pay',
    steps: [(p) => p.getByLabel('Next action fails').check(), (p) => p.getByRole('button', { name: /Confirm/ }).click(), (p) => p.waitForTimeout(1000)],
  },
  'pay-empty': { url: '/tax-jar/pay', steps: [preset('Empty')] },
  'setup-1': { url: '/setup', steps: [preset('Not set up')] },
  'setup-2': { url: '/setup', steps: [preset('Not set up'), (p) => p.getByRole('radio', { name: /Estonia/ }).click(), (p) => p.getByRole('button', { name: 'Continue' }).click()] },
  'setup-3': {
    url: '/setup',
    steps: [
      preset('Not set up'),
      (p) => p.getByRole('radio', { name: /Estonia/ }).click(),
      (p) => p.getByRole('button', { name: 'Continue' }).click(),
      (p) => p.getByRole('radio', { name: /Entrepreneur/ }).click(),
      (p) => p.getByRole('button', { name: 'Continue' }).click(),
    ],
  },
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
  await page.goto(BASE + s.url)
  await page.waitForLoadState('networkidle')
  for (const step of s.steps ?? []) await step(page)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: !!s.full })
  console.log('shot', name)
  await page.close()
}
await browser.close()
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'))
  process.exitCode = 1
}
