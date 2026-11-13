# Wise Tax Jar

Hackathon prototype (theme: Max Ease). A freelancer gets paid, the app recognises the payment as income and sets a percentage aside for taxes in a separate Jar, in the tax currency. Money from a friend is left alone.

> Prototype only. Synthetic data, no real Wise integration. Do not deploy it publicly.

- Roadmap: [roadmap-tax-jar-en.md](roadmap-tax-jar-en.md)
- Shared plan, file ownership and hand-offs: [docs/superpowers/plans/2026-11-13-wise-tax-jar.md](docs/superpowers/plans/2026-11-13-wise-tax-jar.md)
- Your role's tasks: the `-a-frontend`, `-b-backend`, `-c-engine` and `-d-demo` files next to it

## Quick start with Docker

Runs everything: the app at http://taxjar.test:8080 and the simulator, which sends test transactions, at http://simulator.taxjar.test:8081. Once, add the names to `/etc/hosts`, then start:

```bash
grep -q 'taxjar.test' /etc/hosts || echo '127.0.0.1 taxjar.test simulator.taxjar.test' | sudo tee -a /etc/hosts
docker compose up --build -d
```

Details, settings and reset: [docker/README.md](docker/README.md). The sections below run the parts without Docker, for development.

## Prerequisites

- Python 3.10 or newer, with venv support (`sudo apt install python3.10-venv` on Ubuntu/WSL)
- Node 24 (22.22 or newer also works, with engine warnings on install)

## Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs. Tests: `.venv/bin/pytest -q`.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173. It calls `/api`, which Vite proxies to the backend on port 8000, so start the backend first. Tests: `npm test`. Type-check and build: `npm run build`.

It is a web app (Tailwind, Wise-inspired but not Wise's own look): a sidebar on screens 768px and wider (it fits a 1024px projector), a top bar and bottom tabs on phones. Screens, on the frozen routes:

| Route | Screen |
|---|---|
| `/` | Home: balances, live activity feed, the always-visible Tax Jar panel |
| `/transactions/:id` | One payment in a side drawer: why, tax breakdown, Undo |
| `/onboarding` | Set up or edit the tax profile: country (searchable, 80 countries) → regime → rate and currency |
| `/tax-jar` | Tax Jar: total set aside, by month, open questions, every reservation, CSV export |
| `/tax-jar/pay` | Pay tax: pre-filled confirmation → success |
| `/simulator` | Stage tool, for its own tab: the demo payments from `demo/scenarios.json`, a custom payment, demo reset |

What a freelancer gets beyond the golden path:

- **Catch-up after setup.** Client income that arrived before the Tax Jar existed is offered in one card ("Clients paid you €5,554 before your Tax Jar existed. Set aside €1,110.80?"), backed by `GET/POST /api/tax/catch-up`.
- **Any country's currency.** The jar can be kept in the currency of any of the 80 countries (fixed, offline rates in `backend/app/fx.py`, with each currency's own minor units: none for JPY, three for KWD).
- **Nothing blocks the screen.** "Is this payment for work?" is a card docked at the corner; "Decide later" leaves the payment tagged in the feed.
- **Honest when offline.** If the live connection drops, a banner says so and goes away when it recovers.
- **Keyboard and motion.** Escape closes the payment detail and the question, the detail keeps focus inside it, Tax Jar rows open with Enter, and "reduce motion" turns the animations off.

The toast and the "Is this payment for work?" question are driven by the backend's event stream (`/api/events`), so a payment sent from the simulator tab or with `curl` shows up in the app tab. The dark "Demo controls" box in the sidebar is a shortcut for the same thing and can be hidden.

End-to-end checks in a real browser (once: `npx playwright install chromium`; both servers must be running; they reset the backend's demo data):

```bash
npm run golden   # the golden path with assertions, payments sent from a second tab, plus catch-up, keyboard, phone width and a dropped connection
npm run shots    # every screen and state → frontend/screenshots/
```

`frontend/` is the only frontend. The earlier clickable prototype was folded into it and removed; its design notes are in `docs/superpowers/specs/2026-11-13-tax-jar-prototype-design.md`.

`npm install` prints peer-dependency warnings from Neptune's 3D illustration packages. They are expected and do not affect the app.

Do not use `Flag`, `Illustration` or other `@wise/art` components: they load images from wise.com at runtime, and the demo must work with no network.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: the backend tests on Python 3.10 (what the plan requires) and 3.13, the frontend's lint, unit tests and build, then the golden path in a real browser against a running backend. Screenshots and logs are kept as a build artifact.

## The API contract

The contract is frozen: `backend/app/schemas.py`, the route paths, `frontend/src/api/schema.d.ts`, `frontend/src/api/client.ts` and the route table in `frontend/src/App.tsx`. Changes go through the tech lead.

After a contract change, with the backend running:

```bash
cd frontend && npm run gen:api
```

## Team rules

- Branches by role: `fe/*`, `be/*`, `engine/*`, `demo/*`. Merge into `main` after every task.
- Each file has one owner; see "File ownership" in the shared plan.
- Synthetic data only.
- Add a line to [docs/ai-usage.md](docs/ai-usage.md) saying where you used AI.
