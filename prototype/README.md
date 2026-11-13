# Tax Jar prototype

Clickable iOS-style prototype of the Tax Jar, running on the real backend (`../backend`, FastAPI on :8000).
The UI is inspired by the Wise mobile app: a centered phone frame on desktop, a full-bleed layout on
mobile, rounded cards, pill buttons, bottom tabs, sheets and circular SVG country flags.
Vite proxies `/api` to the backend, and live updates (toast, work question) come from its event stream,
`/api/events`. The API client in `src/data/api.ts` mirrors the frozen `frontend/src/api/client.ts`.
Design: `../docs/superpowers/specs/2026-11-13-tax-jar-prototype-design.md`.

Start the backend first (from `../backend`: `.venv/bin/uvicorn app.main:app --reload --port 8000`), then:

```bash
npm install
npx playwright install chromium   # once, for the screenshot scripts
npm run dev                       # http://localhost:5199
npm run shots                     # every screen and state → screenshots/  (dev server must be running)
npm run golden                    # golden path end to end with assertions (resets the backend first)
```

## Screens

- **Home** — greeting, Tax Jar hero with the amount set aside, account balances, latest payments.
- **Tax Jar** — total, estimated tax and deadline, CSV export, monthly chart, pending questions,
  reservations with their tax breakdown.
- **Payments** — all transactions with All / To answer / Tax filters; tap a row for the bottom sheet.
- **Settings** (Setup) — country search with circular flags, registration regime, rate and jar currency.
- **Pay tax** — confirmation, success and error states.

On desktop the app sits in a phone frame; below 720px it becomes full screen. All flags are bundled
locally in `flag-icons`, so the prototype still works with no network access.

## Demo controls

The lime **Demo** pill on Home opens a bottom sheet with the hackathon controls. It sends incoming
payments (Acme, Mari, John) to the backend and sets the screen state. **Not set up**, **Empty** and
**Filled** reset the backend to that state; **Live** shows it as it is; **Loading** and **Error** only
change what the screen shows. **Next action fails** makes the next action fail without calling the
backend. Payments sent from anywhere else (another tab, `curl`) show up live too.

## Security notes

Prototype only: synthetic data, no authentication, no real Wise integration. Do not deploy it
publicly. The UI never injects HTML (`dangerouslySetInnerHTML` is not used), error and backend text is
rendered as text, the country flag code is restricted to two letters before it becomes a CSS class,
the tax rate is clamped to 0–10000 basis points, and the demo payment payloads are fixed fixtures.
