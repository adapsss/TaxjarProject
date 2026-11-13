// Golden path (roadmap section 1) end to end in a real browser, against the real backend.
// Usage: npm run golden      (backend on :8000, `npm run dev` on :5173)
// It RESETS the backend's demo data first. Payments are sent from a second tab (the simulator),
// so this also proves the app reacts to the live event stream, not to its own clicks.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const OUT = new URL('../screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const app = await ctx.newPage()
const sim = await ctx.newPage()
const errors = []
for (const [name, p] of [['app', app], ['simulator', sim]]) {
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
}

const panel = () => app.locator('.sticky.top-8')
async function expectText(locator, re, what) {
  await locator.filter({ hasText: re }).first().waitFor({ timeout: 5000 }).catch(() => {
    throw new Error(`Expected ${what} to match ${re}`)
  })
  console.log('ok ', what)
}
const shot = (n, page = app) => page.screenshot({ path: `${OUT}golden-${n}.png` })
const send = (label) => sim.getByRole('button', { name: label }).click()

// 0. Fresh start
await sim.goto(BASE + '/simulator')
await sim.getByRole('button', { name: /Fresh start/ }).click()
await expectText(sim.locator('header'), /Tax Jar is not set up/, 'simulator: backend reset, Tax Jar off')
await app.goto(BASE + '/')
await expectText(panel(), /Set money aside for taxes automatically/, 'Home offers setup before onboarding')

// A payment before onboarding is saved but nothing is reserved and nothing is asked (plan decision 4).
await send(/Unclear €400/)
await expectText(app.locator('main'), /John Smith/, 'pre-onboarding payment appears live')
if (await app.getByRole('dialog').count()) throw new Error('No question may be asked before onboarding')
if (await app.locator('main').getByText('Needs your answer').count()) throw new Error('No "Needs your answer" tag before onboarding')
console.log('ok  no question and no tag before onboarding')

// 1. Onboarding: search the 80 countries, pick the regime, keep the suggested 20% in EUR.
await app.getByRole('button', { name: /Set up in 3 steps/ }).click()
await app.waitForURL(BASE + '/onboarding')
await app.getByRole('searchbox', { name: 'Search countries' }).fill('eston')
await app.getByRole('radio', { name: 'Estonia' }).click()
await shot('1a-onboarding-country')
await app.getByRole('button', { name: 'Continue' }).click()
await app.getByRole('radio', { name: 'Entrepreneur account' }).click()
await shot('1b-onboarding-regime')
await app.getByRole('button', { name: 'Continue' }).click()
await expectText(app.locator('main'), /we’ll keep €200 for taxes/, 'rate step previews 20% of €1,000')
await shot('1c-onboarding-rate')
await app.getByRole('button', { name: /Start setting money aside/ }).click()
await app.waitForURL(BASE + '/')
await expectText(panel(), /€0/, 'empty Tax Jar after setup')

// 2. Client payment from the simulator tab → toast in the app tab
await send(/Client pays \$1,500/)
await expectText(app.getByRole('status'), /€276 set aside for taxes/, 'Acme toast, driven by the event stream')
await expectText(app.getByRole('status'), /company sender · invoice in reference/, 'Acme why line')
await app.waitForTimeout(1200)
await expectText(panel(), /€276/, 'panel shows €276')
await shot('2-acme-toast')
await expectText(sim.locator('li'), /Acme Inc\.[\s\S]*€276 set aside/, 'simulator log shows the outcome')

// 3. Friend → personal, nothing reserved, no toast
await app.getByRole('button', { name: 'Dismiss' }).click()
await send(/Friend sends €23/)
await expectText(app.locator('main button'), /Mari Tamm[\s\S]*Personal/, 'Mari tagged Personal')
await app.waitForTimeout(600)
if (await app.getByRole('status').count()) throw new Error('Mari must not show a toast')
await expectText(panel(), /€276/, 'jar unchanged after Mari')
await shot('3-mari-personal')

// 4. Unclear → question → Yes → €80
await send(/Unclear €400/)
await expectText(app.getByRole('dialog'), /Is this payment for work\?/, 'John question')
await shot('4a-john-question')
await app.getByRole('button', { name: /Yes, it’s for work/ }).click()
await expectText(app.getByRole('status'), /€80 set aside for taxes/, 'John toast €80')
await app.waitForTimeout(1200)
await expectText(panel(), /€356/, 'panel shows €356')
await shot('4b-john-yes')
// The answer is remembered: John's next payment is reserved with no question.
await app.getByRole('button', { name: 'Dismiss' }).click()
await send(/Unclear €400/)
await expectText(app.getByRole('status'), /€80 set aside for taxes/, 'John is remembered as a client')
if (await app.getByRole('dialog').count()) throw new Error('A known client must not be asked about again')
await app.getByRole('button', { name: 'Dismiss' }).click()

// 5. Tax Jar screen
await app.getByRole('link', { name: 'Tax Jar' }).first().click()
await app.waitForURL(BASE + '/tax-jar')
await expectText(app.locator('main'), /€436/, 'Tax Jar page total €276 + €80 + €80')
await expectText(app.locator('main'), /due by 10 Dec 2026/, 'next deadline from the backend')
await expectText(app.locator('main'), /Of which\s*€174\.40\s*income tax\s*€261\.60\s*social tax/, 'Tax Jar page splits the total into its taxes')
await shot('5-tax-jar')

// 6. Undo from the transaction detail route
await app.getByRole('row', { name: /Acme Inc\./ }).first().click()
await app.waitForURL(/\/transactions\//)
await expectText(app.locator('aside').last(), /1 USD = 0\.92 EUR/, 'detail shows the FX breakdown')
await shot('6a-detail')
await app.getByRole('button', { name: /This wasn’t income/ }).click()
await expectText(app.locator('aside').last(), /Undone/, 'detail shows undone')
await app.getByRole('button', { name: 'Close' }).click()
await app.waitForURL(BASE + '/tax-jar')
await expectText(app.locator('main'), /€160/, 'total back to €160 after undo')
await shot('6b-undone')

// CSV export comes from the backend
const csv = await (await ctx.request.get(BASE + '/api/tax/export.csv')).text()
if (!/Acme Inc\.,INV-042,300\.00,USD,20,0\.92,276\.00,EUR,undone/.test(csv)) throw new Error('CSV export is missing the undone Acme row:\n' + csv)
console.log('ok  CSV export has the undone Acme reservation')

// A failed action leaves everything as it was and says so.
await app.getByRole('button', { name: 'Pay tax' }).click()
await app.waitForURL(BASE + '/tax-jar/pay')
await app.getByLabel('Next action fails').check()
await app.getByRole('button', { name: /Confirm and pay/ }).click()
await expectText(app.getByRole('alert'), /Payment didn’t go through/, 'failed payment is explained')
await shot('7a-pay-error')

// Pay
await app.getByRole('button', { name: 'Try again' }).click()
await expectText(app.locator('main'), /paid to Tax authority \(demo\)/, 'payment success')
await shot('7b-paid')
await app.getByRole('button', { name: 'Back to Tax Jar' }).click()
await expectText(app.locator('main'), /€0/, 'jar empty after paying')
await expectText(app.locator('main'), /Tax paid so far\s*€160/, 'paid total shows €160')

// Paid tax cannot be undone (backend answers 409 reservation_paid; the UI offers no button).
await app.getByRole('row', { name: /John Smith/ }).first().click()
await expectText(app.locator('aside').last(), /already been paid/, 'paid reservation is locked')
if (await app.getByRole('button', { name: /This wasn’t income/ }).count()) throw new Error('Undo must not be offered after paying')
console.log('ok  no Undo after the tax is paid')

// Resetting from the simulator tab: its setup payments stay silent in the app tab,
// but a real payment sent straight after the reset still gets its toast.
await app.goto(BASE + '/')
// Let the app tab finish loading first: a tab that connects in the middle of a reset never heard it start.
await expectText(panel(), /set aside for taxes/, 'app tab loaded before the reset')
await app.waitForTimeout(500)
await sim.getByRole('button', { name: /^Filled/ }).click()
await expectText(panel(), /€775/, 'Filled state arrives in the app tab')
if (await app.getByRole('status').count()) throw new Error('Setup payments must not show a toast')
await send(/Client pays \$1,500/)
await expectText(app.getByRole('status'), /€276 set aside for taxes/, 'a payment right after a reset still shows its toast')
await expectText(app.getByRole('status'), /€110\.40 income tax · €165\.60 social tax/, 'toast shows the tax split')
await shot('8-toast-with-split')

// Keyboard: Escape closes the detail drawer and the work question.
await app.getByRole('button', { name: 'Dismiss' }).click()
await app.locator('main button', { hasText: 'Acme Inc.' }).first().click()
await app.waitForURL(/\/transactions\//)
await expectText(app.locator('aside').last(), /Of which[\s\S]*Income tax[\s\S]*€110\.40[\s\S]*Social tax[\s\S]*€165\.60/, 'detail shows the tax split')
await app.keyboard.press('Escape')
await app.waitForURL(BASE + '/')
console.log('ok  Escape closes the detail drawer')
await send(/Unclear €400/)
await expectText(app.getByRole('dialog'), /Is this payment for work\?/, 'question for a new unclear payment')
await app.keyboard.press('Escape')
await app.getByRole('dialog').waitFor({ state: 'detached' })
await expectText(app.locator('main'), /1 payment needs your answer/, 'Escape postpones the question and Home still flags it')

await browser.close()
if (errors.length) {
  console.log('CONSOLE ERRORS:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('GOLDEN PATH PASSED')
