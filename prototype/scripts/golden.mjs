// Golden path (roadmap section 1) end to end, with assertions and a screenshot at each step.
// Usage: node scripts/golden.mjs   (backend on :8000, dev server on :5199)
// Runs against the real backend: the "Not set up" demo state resets it first.
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5199'
const OUT = new URL('../screenshots/', import.meta.url).pathname
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const panel = () => page.getByTestId('tax-jar-panel')
const main = () => page.locator('main')
const tab = (name) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name })
async function expectText(locator, re, what) {
  await locator.filter({ hasText: re }).first().waitFor({ timeout: 5000 }).catch(() => {
    throw new Error(`Expected ${what} to match ${re}`)
  })
  console.log('ok ', what)
}
const shot = (n) => page.screenshot({ path: `${OUT}golden-${n}.png` })
const openDemo = async () => {
  await page.getByTestId('demo-trigger').click()
  await page.getByRole('dialog', { name: 'Demo controls' }).waitFor()
}
const closeDemo = async () => {
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('dialog', { name: 'Demo controls' }).waitFor({ state: 'hidden' })
}
const sim = async (id) => {
  await openDemo()
  await page.getByTestId(`demo-sim-${id}`).click()
  await page.getByRole('dialog', { name: 'Demo controls' }).waitFor({ state: 'hidden' })
}

await page.goto(BASE + '/')
await page.waitForLoadState('networkidle')
await openDemo()
await page.getByTestId('demo-state-not-set-up').click()
await page.getByRole('dialog', { name: 'Demo controls' }).waitFor({ state: 'hidden' })

// 1. Onboarding
await page.getByRole('button', { name: /Set up in 3 steps/ }).click()
await page.getByRole('radio', { name: 'Estonia', exact: true }).click()
await page.getByRole('button', { name: 'Continue' }).click()
await page.getByRole('radio', { name: /Entrepreneur/ }).click()
await page.getByRole('button', { name: 'Continue' }).click()
await page.getByRole('button', { name: /Start setting money aside/ }).click()
await page.waitForURL(BASE + '/')
await expectText(panel(), /€0/, 'empty Tax Jar after setup')
await shot('1-setup-done')

// 2. Client payment → €276
await sim('acme')
await expectText(page.getByRole('status'), /€276 set aside for taxes/, 'Acme toast')
await expectText(page.getByRole('status'), /company sender · invoice in reference/, 'Acme why line')
await page.waitForTimeout(1200)
await expectText(panel(), /€276/, 'panel shows €276')
await shot('2-acme')

// 3. Friend → personal, nothing reserved
await page.getByRole('button', { name: 'Dismiss' }).click()
await sim('mari')
await page.waitForTimeout(800)
if (await page.getByRole('status').count()) throw new Error('Mari must not show a toast')
await expectText(page.locator('[data-tx-id]').filter({ hasText: 'Mari Tamm' }), /Personal/, 'Mari tagged Personal')
await shot('3-mari')

// 4. Unclear → question → Yes → €80
await sim('john')
await page.getByRole('dialog', { name: /Is this payment for work/ }).waitFor()
await expectText(page.getByRole('dialog'), /Is this payment for work\?/, 'John question')
await shot('4a-john-question')
await page.getByRole('button', { name: /Yes, it’s for work/ }).click()
await expectText(page.getByRole('status'), /€80 set aside for taxes/, 'John toast €80')
await page.waitForTimeout(1200)
await expectText(panel(), /€356/, 'panel shows €356')
await shot('4b-john-yes')

// 5. Tax Jar screen (the backend keeps state across a reload: €356 so far, + €276)
await page.goto(BASE + '/')
await page.waitForLoadState('networkidle')
await sim('acme')
await page.waitForTimeout(700)
await tab('Tax Jar').click()
await expectText(main(), /€632/, 'Tax Jar page total €356 + €276')

// 6. Undo from the sheet (the newest Acme row is first in "What went in")
await page.locator('main button').filter({ hasText: 'Acme Inc.' }).first().click()
const sheet = page.getByRole('dialog', { name: 'Payment details' })
await sheet.waitFor()
await sheet.getByRole('button', { name: /This wasn’t income/ }).click()
await expectText(sheet, /Undone/, 'sheet shows undone')
await sheet.getByRole('button', { name: 'Close' }).click()
await sheet.waitFor({ state: 'hidden' })
await expectText(main(), /€356/, 'total back to €356 after undo')
await shot('6-undo')

// 7. Pay
await page.getByRole('button', { name: 'Pay tax' }).click()
await page.getByRole('button', { name: /Confirm and pay/ }).click()
await expectText(main(), /paid to Tax authority \(demo\)/i, 'payment success')
await page.getByRole('button', { name: 'Back to Tax Jar' }).click()
await expectText(main(), /€0/, 'jar empty after paying')
await shot('7-paid')

// 8. Error path: the demo switch makes the next action fail without touching the backend.
await page.goto(BASE + '/')
await page.waitForLoadState('networkidle')
await openDemo()
await page.getByTestId('demo-state-filled').click()
await page.getByRole('dialog', { name: 'Demo controls' }).waitFor({ state: 'hidden' })
await page.waitForTimeout(600)
await openDemo()
await page.getByRole('switch', { name: 'Next action fails' }).click()
await closeDemo()
await tab('Tax Jar').click()
await page.getByRole('button', { name: 'Pay tax' }).click()
await page.getByRole('button', { name: /Confirm and pay/ }).click()
await expectText(main(), /Payment didn’t go through/, 'payment error path')
console.log('ok ', 'error path still on the pay screen')

await browser.close()
if (errors.length) {
  console.log('CONSOLE ERRORS:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('GOLDEN PATH PASSED')
