# Tax Jar prototype

Clickable desktop prototype of the Tax Jar, running on the contract-shaped mocks in `../fixtures/`.
No backend: an in-browser stand-in for the payment pipeline lives in `src/data/engine.ts`.
Design: `../docs/superpowers/specs/2026-11-13-tax-jar-prototype-design.md`.

```bash
npm install
npx playwright install chromium   # once, for the screenshot scripts
npm run dev                       # http://localhost:5199
npm run shots                     # every screen and state → screenshots/  (dev server must be running)
npm run golden                    # golden path end to end with assertions
```

The dark **Demo controls** box in the sidebar simulates incoming payments (Acme, Mari, John), switches the
screen state (Filled, Empty, Not set up, Loading, Error) and can make the next action fail.
Reloading the page resets everything to the filled fixtures.
