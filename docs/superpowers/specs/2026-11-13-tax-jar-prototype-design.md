# Tax Jar prototype: design (short)

**Intent.** A clickable desktop web prototype of the Tax Jar, so the team can see and demo the screens and states before the real backend exists. It is a web app (better for a hackathon demo on a laptop and projector), Wise-inspired but not a copy.

**Source.** `docs/pipeline.md` and `fixtures/` did not exist, so the pipeline comes from `roadmap-tax-jar-en.md` sections 1, 4, 5 and `docs/superpowers/plans/2026-11-13-wise-tax-jar.md`, and the fixtures are written here, shaped exactly like the API contract (camelCase, amounts in cents, rates in basis points).

## Decided with the user
- **Placement:** a compact Tax Jar panel always visible on Home beside the transaction feed, opening a full Tax Jar page.
- **Hero number:** "set aside" (e.g. €1,284.00 set aside for taxes).
- **Interactivity:** a clickable demo running on fixtures in the browser: simulate Acme / Mari / John arriving, the toast and the work question appear, totals update, Undo and Pay work. A demo-controls switcher also jumps to Not set up / Empty / Loading / Error.
- **Setup flow included:** country → regime → rate and tax currency.
- **Stack:** Vite, React, TypeScript, Tailwind; screens verified with Playwright screenshots.

## Screens and states
1. **Home** — sidebar, balances, live activity feed (tags: Tax set aside / Personal / Needs your answer), Tax Jar panel (total, monthly bars, next deadline, Pay tax). Not-set-up variant: the panel becomes a Set up card.
2. **Tax Jar page** — hero total, estimated due and next deadline, monthly bars (reserved vs paid), reservations list with status, Pay tax, Export CSV, disclaimer. States: not set up, empty, filled, loading, error.
3. **Live moments** — toast "€276 set aside for taxes" + why line + Undo (6 s); question dialog "Is this payment for work?" Yes / No, buttons disabled while in flight.
4. **Reservation detail** (drawer) — received, rate, FX rate, reserved, why; states reserved (Undo), undone, paid (Undo locked).
5. **Pay tax** — pre-filled confirmation (Tax authority (demo), amount, reference) → sending → success; disabled at €0.
6. **Setup** — 3 steps with the disclaimer on the last; finishing enables the profile.

## Approaches considered
- **Prototype inside `frontend/` against the S0 stubs** — rejected: S0 does not exist yet and `frontend/` is role A's real app.
- **Static screen gallery** — rejected by the user in favour of a clickable demo.
- **Chosen: a separate `prototype/` Vite app with an in-browser mock pipeline over `fixtures/`.**

## My calls (correct me)
- Lives in `prototype/`; fixtures in `fixtures/` at the repo root so role A can reuse them as mocks later.
- The in-browser pipeline does not reimplement the classifier: demo scenarios carry their classification in `fixtures/scenarios.json`. Thresholds, FX (USD→EUR 0.92, GBP→EUR 1.15) and the 20% rate follow the plan, so Acme gives €276 and John gives €80.
- Colours: lime `#A6EA76` and forest `#1A3A10` (close to Wise, not its exact tokens), own "Tax Jar" wordmark, footer "Hackathon prototype · not affiliated with Wise". Font: Inter bundled via npm (no CDN, per the plan's offline rule).
- Pay is its own route (`/tax-jar/pay`), matching the plan's routes; reservation detail is a side drawer.
- The hero number counts up and a "+€276" chip appears when money lands, so the moment reads on a projector.

## Non-goals
No real backend, no SSE, no persistence beyond the page session, no mobile layout, no tests beyond screenshot checks.
