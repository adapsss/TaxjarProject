// Golden path (roadmap section 1) end to end in a real browser, against the real backend.
// Usage: npm run golden      (backend on :8000, `npm run dev` on :5173; BASE=... to aim elsewhere)
// It RESETS the backend's demo data first. Payments are sent from a second tab (the simulator),
// so this also proves the app reacts to the live event stream, not to its own clicks.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const OUT = new URL('../screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
// A phone-sized window: the app is a phone app first (on a desktop it sits in a device frame).
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const app = await ctx.newPage()
const sim = await ctx.newPage()
const errors = []
for (const [name, p] of [['app', app], ['simulator', sim]]) {
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
}

const panel = () => app.getByTestId('tax-jar-panel')
const main = () => app.locator('main')
const tab = (name) => app.getByRole('navigation', { name: 'Main' }).getByRole('link', { name })
async function expectText(locator, re, what) {
  await locator.filter({ hasText: re }).first().waitFor({ timeout: 6000 }).catch(() => {
    throw new Error(`Expected ${what} to match ${re}`)
  })
  console.log('ok ', what)
}
const shot = (n, page = app) => page.screenshot({ path: `${OUT}golden-${n}.png` })
const send = (label) => sim.getByRole('button', { name: label }).click()
const sheet = () => app.getByRole('dialog', { name: /^Payment (from|to)/ })

// 0. Fresh start
await sim.goto(BASE + '/simulator')
await sim.getByRole('button', { name: /Fresh start/ }).click()
await expectText(sim.locator('header'), /Tax Jar is not set up/, 'simulator: backend reset, Tax Jar off')
await sim.getByRole('button', { name: /Client pays \$1,500 \(Acme Inc\.\)/ }).waitFor({ timeout: 5000 })
console.log('ok  simulator lists the scenarios from the API')
await app.goto(BASE + '/')
await expectText(panel(), /Never be surprised by a tax bill/, 'Home offers setup before onboarding')

// A payment before onboarding is saved but nothing is reserved and nothing is asked (plan decision 4).
await send(/Unclear €400/)
await expectText(main(), /John Smith/, 'pre-onboarding payment appears live')
if (await app.getByRole('dialog').count()) throw new Error('No question may be asked before onboarding')
if (await main().getByText('Needs your answer').count()) throw new Error('No "Needs your answer" tag before onboarding')
console.log('ok  no question and no tag before onboarding')

// 1. Onboarding: search the 80 countries, pick the regime, keep the suggested 20% in EUR.
await app.getByRole('button', { name: /Set up in 3 steps/ }).click()
await app.waitForURL(BASE + '/onboarding')
await app.getByRole('searchbox').fill('eston')
await app.getByRole('radio', { name: 'Estonia', exact: true }).click()
await shot('1a-onboarding-country')
await app.getByRole('button', { name: 'Continue' }).click()
await app.getByRole('radio', { name: /Entrepreneur/ }).click()
await shot('1b-onboarding-regime')
await app.getByRole('button', { name: 'Continue' }).click()
await expectText(main(), /we’ll keep\s*€200 for taxes/, 'rate step previews 20% of €1,000')
await shot('1c-onboarding-rate')
await app.getByRole('button', { name: /Start setting money aside/ }).click()
await app.waitForURL(BASE + '/')
await expectText(panel(), /€0/, 'empty Tax Jar after setup')
// Six seed payments from clients arrived before the jar existed: the app offers to catch up on them.
const offer = app.locator('section[aria-labelledby="catch-up-title"]')
await expectText(offer, /Clients paid you €5,554[\s\S]*6\s*payments[\s\S]*€1,110\.80/, 'catch-up offer for earlier income')
await shot('1d-catch-up-offer')
await offer.getByRole('button', { name: 'Not now' }).click() // the golden path keeps its round numbers; catch-up is tested at the end

// 2. Client payment from the simulator tab → toast in the app tab
await send(/Client pays \$1,500/)
await expectText(app.getByRole('status'), /€276 set aside for taxes/, 'Acme toast, driven by the event stream')
await expectText(app.getByRole('status'), /company sender · invoice in reference/, 'Acme why line')
await expectText(app.getByRole('status'), /€110\.40 income tax · €165\.60 social tax/, 'toast shows the tax split')
await app.waitForTimeout(1200)
await expectText(panel(), /€276/, 'panel shows €276')
await shot('2-acme-toast')
await expectText(sim.locator('li'), /Acme Inc\.[\s\S]*€276 set aside/, 'simulator log shows the outcome')

// 3. Friend → personal, nothing reserved, no toast
await app.getByRole('button', { name: 'Dismiss' }).click()
await send(/Friend sends €23/)
await tab('Payments').click()
await expectText(app.locator('[data-tx-id]').filter({ hasText: 'Mari Tamm' }), /Personal/, 'Mari tagged Personal')
await app.waitForTimeout(600)
if (await app.getByRole('status').count()) throw new Error('Mari must not show a toast')
await shot('3-mari-personal')

// 4. Unclear → question → Yes → €80
await send(/Unclear €400/)
await expectText(app.getByRole('dialog'), /Is this payment for work\?/, 'John question')
await shot('4a-john-question')
await app.getByRole('button', { name: /Yes, it’s for work/ }).click()
await expectText(app.getByRole('status'), /€80 set aside for taxes/, 'John toast €80')
// The answer is remembered: John's next payment is reserved with no question.
await app.getByRole('button', { name: 'Dismiss' }).click()
await send(/Unclear €400/)
await expectText(app.getByRole('status'), /€80 set aside for taxes/, 'John is remembered as a client')
if (await app.getByRole('dialog').count()) throw new Error('A known client must not be asked about again')
await app.getByRole('button', { name: 'Dismiss' }).click()

// 5. Tax Jar screen
await tab('Tax Jar').click()
await app.waitForURL(BASE + '/tax-jar')
await expectText(main(), /€436/, 'Tax Jar page total €276 + €80 + €80')
await expectText(main(), /due by 10 Dec 2026/, 'next deadline from the backend')
await expectText(main(), /€174\.40 income tax/, 'Tax Jar page splits the total: income tax')
await expectText(main(), /€261\.60 social tax/, 'Tax Jar page splits the total: social tax')
await shot('5-tax-jar')

// 6. Open a payment: how it was handled, and the exact tax button
await main().locator('button').filter({ hasText: 'Acme Inc.' }).first().click()
await app.waitForURL(/\/transactions\//)
await expectText(sheet(), /How Tax Jar handled it/, 'payment sheet opens')
await expectText(sheet(), /Arrived[\s\S]*Recognised as work income[\s\S]*20% set aside for tax[\s\S]*In your Tax Jar/, 'sheet lists the steps')
await sheet().getByRole('button', { name: /How is €276\.00 worked out\?/ }).click()
await expectText(sheet().getByRole('table'), /Social tax\s*12%\s*\$180\.00\s*€165\.60[\s\S]*Income tax\s*8%\s*\$120\.00\s*€110\.40[\s\S]*Set aside\s*20%\s*\$300\.00\s*€276\.00[\s\S]*Yours to keep\s*80%\s*\$1,200\.00/, 'breakdown button shows each tax as a share of the payment')
await shot('6a-breakdown')
// The sheet is modal: Escape closes it and returns to the Tax Jar.
await app.keyboard.press('Escape')
await app.waitForURL(BASE + '/tax-jar')
console.log('ok  Escape closes the payment sheet')

// 7. Undo from the sheet
await main().locator('button').filter({ hasText: 'Acme Inc.' }).first().click()
await sheet().getByRole('button', { name: /This wasn’t income/ }).click()
await expectText(sheet(), /Undone/, 'sheet shows undone')
await app.getByRole('button', { name: 'Close' }).click()
await app.waitForURL(BASE + '/tax-jar')
await expectText(main(), /€160/, 'total back to €160 after undo')
await shot('7-undone')

// CSV export comes from the backend
const csv = await (await ctx.request.get(BASE + '/api/tax/export.csv')).text()
if (!/Acme Inc\.,INV-042,300\.00,USD,20,0\.92,276\.00,EUR,undone/.test(csv)) throw new Error('CSV export is missing the undone Acme row:\n' + csv)
console.log('ok  CSV export has the undone Acme reservation')

// 8. Pay
await app.getByRole('button', { name: 'Pay tax' }).first().click()
await app.waitForURL(BASE + '/tax-jar/pay')
await app.getByRole('button', { name: /Confirm and pay/ }).click()
await expectText(main(), /paid to Tax authority \(demo\)/i, 'payment success')
await shot('8-paid')
await app.getByRole('button', { name: 'Back to Tax Jar' }).first().click()
await expectText(main(), /€0/, 'jar empty after paying')

// Paid tax cannot be undone: the sheet offers no Undo and says why.
await main().locator('button').filter({ hasText: 'John Smith' }).first().click()
await expectText(sheet(), /Paid to the tax authority/, 'paid payment says so')
if (await sheet().getByRole('button', { name: /This wasn’t income/ }).count()) throw new Error('Undo must not be offered after paying')
console.log('ok  no Undo after the tax is paid')
await app.keyboard.press('Escape')

// 9. Payments: how it works, with a Try button that really sends the payment
await sim.getByRole('button', { name: /^Filled/ }).click()
await expectText(sim.locator('header'), /Tax Jar is on/, 'simulator: Filled state set up')
await app.goto(BASE + '/activity')
await expectText(main(), /How Tax Jar treats payments/, 'Payments explains how payments are treated')
await app.getByTestId('try-acme').click()
await expectText(app.getByRole('status'), /€276 set aside for taxes/, 'Try button sends a real payment through the pipeline')
await app.getByRole('button', { name: 'Dismiss' }).click()
await shot('9-how-it-works')

// 10. Catch-up: from "Set up" (onboarded, empty jar), take the offer.
await sim.getByRole('button', { name: /^Set up/ }).click()
await app.goto(BASE + '/')
await expectText(offer, /€1,110\.80/, 'catch-up offered after a reset')
await offer.getByRole('button', { name: /Set aside €1,110\.80/ }).click()
await expectText(app.getByRole('status'), /€1,110\.80 set aside for earlier income[\s\S]*6 client payments/, 'one summary toast for the catch-up')
await app.waitForTimeout(1200)
await expectText(panel(), /€1,110\.80/, 'panel shows the caught-up total')
if (await offer.count()) throw new Error('The offer must go away once taken')
await shot('10-caught-up')

// 11. Phone checks: nothing wider than the screen, and every tap target is at least 44pt.
for (const path of ['/', '/activity', '/tax-jar', '/onboarding', '/tax-jar/pay', '/simulator']) {
  await app.goto(BASE + path)
  await app.waitForTimeout(1500)
  const overflow = await app.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 1) throw new Error(`${path} is ${overflow}px wider than a phone screen`)
  if (path === '/simulator') continue // a stage tool, not part of the product
  const small = await app.evaluate(() =>
    [...document.querySelectorAll('button, a[href], [role="radio"], [role="tab"], summary')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const visible = r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
        return visible && (r.height < 43.5 || r.width < 43.5)
      })
      .map((el) => {
        const r = el.getBoundingClientRect()
        return `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`
      }),
  )
  if (small.length) throw new Error(`${path} has tap targets under 44pt: ${small.join('; ')}`)
}
console.log('ok  phone: every screen fits 390px and every tap target is at least 44pt')

// Reduced motion: slide-ins and count-ups are switched off.
const calm = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
await calm.goto(BASE + '/')
await calm.waitForTimeout(800)
const dur = await calm.evaluate(() => getComputedStyle(document.querySelector('main > div') ?? document.body).animationDuration)
if (!(parseFloat(dur) < 0.001)) throw new Error(`Animations still run under reduced motion: ${dur}`) // seconds: 1e-05s is 0.01ms
console.log('ok  reduced motion turns animations off')
await calm.close()

// The live connection drops: the app says so, then recovers by itself (EventSource retries).
const offline = await ctx.newPage()
let block = true
await offline.route('**/api/events', (route) => (block ? route.abort() : route.continue()))
await offline.goto(BASE + '/')
await expectText(offline.getByRole('alert'), /Connection lost\. Reconnecting/, 'banner when the live connection is down')
await shot('11-offline', offline)
block = false
await offline.getByRole('alert').filter({ hasText: 'Connection lost' }).waitFor({ state: 'detached', timeout: 15000 })
console.log('ok  banner goes away once the connection is back')
await offline.close()

// A desktop window shows the same app inside a phone frame.
const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await desk.goto(BASE + '/')
await desk.waitForTimeout(1200)
if (!(await desk.locator('.device').count())) throw new Error('Desktop should show the phone frame')
await shot('12-desktop-frame', desk)
console.log('ok  desktop shows the phone frame')
await desk.close()

await browser.close()
if (errors.length) {
  console.log('CONSOLE ERRORS:\n' + errors.join('\n'))
  process.exit(1)
}
console.log('GOLDEN PATH PASSED')
