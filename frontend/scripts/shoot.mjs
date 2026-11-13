// Screenshot every screen and state with Playwright, for a visual check.
// Usage: npm run shots [name-filter]   (backend on :8000, `npm run dev` on :5173)
// "Filled", "Empty" and "Not set up" RESET the backend's demo data to that state.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const OUT = new URL('../screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const state = (label) => async (p) => {
  await p.locator('#demo-state').selectOption({ label })
  // Presets that reset the backend show the loading skeleton until they are done.
  if (label !== 'Loading' && label !== 'Error') await p.locator('#demo-state:not(:disabled)').waitFor()
  await p.waitForTimeout(label === 'Filled' ? 1200 : 600)
}
const click = (role, name) => (p) => p.getByRole(role, { name }).first().click()
const pause = (ms) => (p) => p.waitForTimeout(ms)

const SHOTS = {
  'home-filled': { url: '/', steps: [state('Filled')] },
  'home-toast': { url: '/', steps: [state('Filled'), click('button', /Acme Inc\./), pause(1500)] },
  'home-question': { url: '/', steps: [state('Empty'), click('button', /John Smith/), pause(900)] },
  'home-not-set-up': { url: '/', steps: [state('Not set up')] },
  'home-loading': { url: '/', steps: [state('Loading')] },
  'home-error': { url: '/', steps: [state('Error')] },
  'detail-fx': { url: '/', steps: [state('Filled'), click('button', /Brightside Ltd/), pause(500)] },
  'taxjar-filled': { url: '/tax-jar', steps: [state('Filled')], full: true },
  'taxjar-empty': { url: '/tax-jar', steps: [state('Empty')], full: true },
  'taxjar-not-set-up': { url: '/tax-jar', steps: [state('Not set up')] },
  'taxjar-loading': { url: '/tax-jar', steps: [state('Loading')] },
  'taxjar-error': { url: '/tax-jar', steps: [state('Error')] },
  'pay-confirm': { url: '/tax-jar/pay', steps: [state('Filled')] },
  'pay-empty': { url: '/tax-jar/pay', steps: [state('Empty')] },
  'onboarding-countries': { url: '/onboarding', steps: [state('Not set up')] },
  'onboarding-edit': { url: '/onboarding', steps: [state('Filled')] },
  simulator: { url: '/simulator', steps: [click('button', /Fresh start/), pause(800), click('button', /Client pays/), pause(800)] },
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
  await page.locator('#root > *').first().waitFor()
  await page.waitForTimeout(500)
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
