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

It is a desktop web app (sidebar layout, Tailwind, Wise-inspired but not Wise's own look), not the phone-width frame the first plan described. Screens, on the frozen routes:

| Route | Screen |
|---|---|
| `/` | Home: balances, live activity feed, the always-visible Tax Jar panel |
| `/transactions/:id` | One payment in a side drawer: why, tax breakdown, Undo |
| `/onboarding` | Set up or edit the tax profile: country (searchable, 80 countries) → regime → rate and currency |
| `/tax-jar` | Tax Jar: total set aside, by month, open questions, every reservation, CSV export |
| `/tax-jar/pay` | Pay tax: pre-filled confirmation → success |
| `/simulator` | Stage tool, for its own tab: the demo payments (from the database, `GET /api/demo/scenarios`), a custom payment, demo reset |

The toast and the "Is this payment for work?" question are driven by the backend's event stream (`/api/events`), so a payment sent from the simulator tab or with `curl` shows up in the app tab. The dark "Demo controls" box in the sidebar is a shortcut for the same thing and can be hidden.

End-to-end checks in a real browser (once: `npx playwright install chromium`; both servers must be running; they reset the backend's demo data):

```bash
npm run golden   # the golden path with assertions, payments sent from a second tab
npm run shots    # every screen and state → frontend/screenshots/
```

`frontend/` is the only frontend. The earlier clickable prototype was folded into it and removed; its design notes are in `docs/superpowers/specs/2026-11-13-tax-jar-prototype-design.md`.

`npm install` prints peer-dependency warnings from Neptune's 3D illustration packages. They are expected and do not affect the app.

Do not use `Flag`, `Illustration` or other `@wise/art` components: they load images from wise.com at runtime, and the demo must work with no network.

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
