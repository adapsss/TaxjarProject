// Golden path (roadmap section 1) end to end, with assertions and a screenshot at each step.
// Usage: node scripts/golden.mjs   (backend on :8000, dev server on :5199)
// Runs against the real backend: "Not set up" in the demo controls resets it first.
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5199'
const OUT = new URL('../screenshots/', import.meta.url).pathname
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const panel = () => page.locator('.sticky.top-8')
async function expectText(locator, re, what) {
  await locator.filter({ hasText: re }).first().waitFor({ timeout: 4000 }).catch(() => {
    throw new Error(`Expected ${what} to match ${re}`)
  })
  console.log('ok ', what)
}
const shot = (n) => page.screenshot({ path: `${OUT}golden-${n}.png` })
const sim = (name) => page.getByRole('button', { name: new RegExp(name) }).first().click()

await page.goto(BASE + '/')
await page.locator('aside select').selectOption({ label: 'Not set up' })

// 1. Onboarding
await page.getByRole('button', { name: /Set up in 3 steps/ }).click()
await page.getByRole('radio', { name: /Estonia/ }).click()
await page.getByRole('button', { name: 'Continue' }).click()
await page.getByRole('radio', { name: /Entrepreneur/ }).click()
await page.getByRole('button', { name: 'Continue' }).click()
await page.getByRole('button', { name: /Start setting money aside/ }).click()
await page.waitForURL(BASE + '/')
await expectText(panel(), /€0/, 'empty Tax Jar after setup')
await shot('1-setup-done')

// 2. Client payment → €276
await sim('Acme')
await expectText(page.getByRole('status'), /€276 set aside for taxes/, 'Acme toast')
await expectText(page.getByRole('status'), /company sender · invoice in reference/, 'Acme why line')
await page.waitForTimeout(1200)
await expectText(panel(), /€276/, 'panel shows €276')
await shot('2-acme')

// 3. Friend → personal, nothing reserved
await page.getByRole('button', { name: 'Dismiss' }).click()
await sim('Mari')
await page.waitForTimeout(800)
if (await page.getByRole('status').count()) throw new Error('Mari must not show a toast')
await expectText(page.locator('main button'), /Mari Tamm[\s\S]*Personal/, 'Mari tagged Personal')
await shot('3-mari')

// 4. Unclear → question → Yes → €80
await sim('John')
await expectText(page.getByRole('dialog'), /Is this payment for work\?/, 'John question')
await shot('4a-john-question')
await page.getByRole('button', { name: /Yes, it’s for work/ }).click()
await expectText(page.getByRole('status'), /€80 set aside for taxes/, 'John toast €80')
await page.waitForTimeout(1200)
await expectText(panel(), /€356/, 'panel shows €356')
await shot('4b-john-yes')

// 5. Tax Jar screen (the backend keeps state across a reload: €356 so far, + €276)
await page.goto(BASE + '/')
await sim('Acme')
await page.waitForTimeout(700)
await page.getByRole('link', { name: 'Tax Jar' }).first().click()
await expectText(page.locator('main'), /€632/, 'Tax Jar page total €356 + €276')

// 6. Undo from the drawer (the newest Acme row is first)
await page.getByRole('row', { name: /Acme Inc\./ }).first().click()
await page.getByRole('button', { name: /This wasn’t income/ }).click()
await expectText(page.locator('aside'), /Undone/, 'drawer shows undone')
await page.getByRole('button', { name: 'Close' }).click()
await expectText(page.locator('main'), /€356/, 'total back to €356 after undo')
await shot('6-undo')

// Pay
await page.getByRole('button', { name: 'Pay tax' }).click()
await page.getByRole('button', { name: /Confirm and pay/ }).click()
await expectText(page.locator('main'), /paid to Tax authority \(demo\)/, 'payment success')
await page.getByRole('button', { name: 'Back to Tax Jar' }).click()
await expectText(page.locator('main'), /€0/, 'jar empty after paying')
await shot('7-paid')

await browser.close()
if (errors.length) {
  console.log('CONSOLE ERRORS:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('GOLDEN PATH PASSED')
