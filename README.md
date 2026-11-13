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

Compose starts Postgres, runs the migrations and the data import (the one-off `migrate` service), then the backend and the web gateway. Details, settings and reset: [docker/README.md](docker/README.md). The sections below run the parts without Docker, for development.

## Data

Everything lives in Postgres: the app state, all tax data (80 countries, their regimes, rates, brackets, social contributions, deadlines, sources and legal forms), the demo seed and the demo scenarios.

- **The database is the source of truth.** `python -m app.data_load` imports the JSON in `backend/app/engine/` and `demo/` only into empty tables, so it is safe to run on every start. After that, change data in the database, for now with SQL. `--replace tax` (or `demo_seed`, `demo_scenarios`) overwrites a dataset from the JSON again, and is logged.
- **Every change to tax data is recorded** in `tax_change_log` (old row, new row, time, database user) by a trigger. Constraints reject values the engine can't handle, such as a rate above 100%.
- **Edits show up without a restart**: the backend re-reads tax data every `TAX_DATA_REFRESH_SECONDS` (60 by default).
- **Schema changes** are Alembic migrations in `backend/migrations/` (`alembic upgrade head`).
- The JSON files are what fills a new database (a fresh local stack, a new AWS database). skurbro's build in `backend/tools/tax_data/` still produces and checks them.

## Prerequisites

- Python 3.10 or newer, with venv support (`sudo apt install python3.10-venv` on Ubuntu/WSL)
- Node 24 (22.22 or newer also works, with engine warnings on install)

## Backend

The backend needs Postgres. Start only the database from Compose (it listens on `127.0.0.1:5433`), then migrate, import and run:

```bash
docker compose up -d db
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg://taxjar:taxjar@localhost:5433/taxjar
.venv/bin/alembic upgrade head
.venv/bin/python -m app.data_load
.venv/bin/uvicorn app.main:app --reload --port 8000
```

The backend refuses to start on a database that isn't migrated or imported, and says which step is missing. API docs: http://localhost:8000/docs.

Tests run on Postgres too, in a database of their own (created once: `docker compose exec db psql -U taxjar -c "create database taxjar_test"`): `.venv/bin/pytest -q`. Set `TEST_DATABASE_URL` to use another server. Each test runs in a transaction that is rolled back.

Settings (environment): `DATABASE_URL` (required), `DEMO_MODE` (default `true`; `false` removes the reset, simulator and demo-scenario routes), `TAX_DATA_REFRESH_SECONDS` (default `60`).

## Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173. It calls `/api`, which Vite proxies to the backend on port 8000, so start the backend first. Tests: `npm test`. Type-check and build: `npm run build`.

It is an iPhone-style web app (Tailwind, Wise-inspired but not Wise's own look). On a phone it fills the screen with a bottom tab bar; on a desktop it sits inside a phone frame, so it demos well on a projector. Screens, on the frozen routes plus `/activity`:

| Route | Screen |
|---|---|
| `/` | Home: the Tax Jar card (total set aside, deadline, Pay tax), your accounts, latest payments |
| `/activity` | Payments: "How Tax Jar treats payments" (the three cases, each with a **Try** button that sends a real test payment), then every payment with All / To answer / Tax filters |
| `/transactions/:id` | One payment as a sheet: **how Tax Jar handled it, step by step** (arrived, recognised and why, tax set aside, where the money is now), and the **"How is €276 worked out?"** button |
| `/onboarding` | Set up or edit the tax profile: country (searchable, 80 countries) → regime → rate and currency |
| `/tax-jar` | Tax Jar: total set aside split into its taxes, by month, open questions, every reservation, CSV export |
| `/tax-jar/pay` | Pay tax: pre-filled confirmation → success |
| `/simulator` | Stage tool, for its own tab: the demo payments (from the database, `GET /api/demo/scenarios`), a custom payment, demo reset |

**The tax-breakdown button.** On a payment that had tax set aside, "How is €276.00 worked out?" opens each tax as a share of what arrived, in both currencies, and what stays yours: 12% social tax ($180.00 → €165.60), 8% income tax ($120.00 → €110.40), 20% set aside, 80% yours to keep. The rows always add up to exactly what was taken (`frontend/src/lib/breakdown.ts`). For regimes taxed on yearly profit the backend sends no exact split, so it shows one "Tax" row and says the rest is worked out on the return.

What a freelancer gets beyond the golden path:

- **Catch-up after setup.** Client income that arrived before the Tax Jar existed is offered in one card ("Clients paid you €5,554 before your Tax Jar existed. Set aside €1,110.80?"), backed by `GET/POST /api/tax/catch-up`.
- **Any country's currency.** The jar can be kept in the currency of any of the 80 countries (fixed, offline rates in `backend/app/fx.py`, with each currency's own minor units: none for JPY, three for KWD).
- **Nothing blocks the screen.** "Is this payment for work?" is a card above the tab bar; "Decide later" leaves the payment tagged in the list.
- **Honest when offline.** If the live connection drops, a banner says so and goes away when it recovers.
- **Easy to use.** Text is at least 13px (body 15-17px), every button and link is at least 44pt (checked by the browser test), sheets keep focus inside them and close with Escape, Tax Jar rows open with Enter, "Reduce Motion" turns animations off, and on a real phone there is no fake status bar.

The toast and the "Is this payment for work?" question are driven by the backend's event stream (`/api/events`), so a payment sent from the simulator tab or with `curl` shows up in the app tab. The lime **Demo** button on Home opens the same controls as a sheet (test payments, a custom payment, screen states) and can be ignored in the product.

End-to-end check in a real browser (once: `npx playwright install chromium`; both servers must be running; it resets the backend's demo data):

```bash
npm run golden   # the golden path with assertions, payments sent from a second tab, plus the payment sheet and breakdown, catch-up, phone width and tap sizes, reduced motion and a dropped connection
```

It leaves screenshots of every step in `frontend/screenshots/`.

`frontend/` is the only frontend. The earlier clickable prototype was folded into it and removed; its design notes are in `docs/superpowers/specs/2026-11-13-tax-jar-prototype-design.md`.

`npm install` prints peer-dependency warnings from Neptune's 3D illustration packages. They are expected and do not affect the app.

Do not use `Flag`, `Illustration` or other `@wise/art` components: they load images from wise.com at runtime, and the demo must work with no network.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: the backend tests on Python 3.10 (what the plan requires) and 3.13, the frontend's lint, unit tests and build, then the golden path in a real browser against a running backend. Screenshots and logs are kept as a build artifact.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml` on the team's EC2 server: it builds both images, runs the backend and frontend tests inside them, pushes the images to ECR and restarts the app from `compose.prod.yaml`. A failing test stops the deploy. Server setup, rollback and day-to-day commands: [docs/deploy.md](docs/deploy.md).

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
