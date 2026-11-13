# Wise Tax Jar

Hackathon prototype (theme: Max Ease). A freelancer gets paid, the app recognises the payment as income and sets a percentage aside for taxes in a separate Jar, in the tax currency. Money from a friend is left alone.

> Prototype only. Synthetic data, no real Wise integration. Do not deploy it publicly.

- Roadmap: [roadmap-tax-jar-en.md](roadmap-tax-jar-en.md)
- Shared plan, file ownership and hand-offs: [docs/superpowers/plans/2026-11-13-wise-tax-jar.md](docs/superpowers/plans/2026-11-13-wise-tax-jar.md)
- Your role's tasks: the `-a-frontend`, `-b-backend`, `-c-engine` and `-d-demo` files next to it

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

`npm install` prints peer-dependency warnings from Neptune's 3D illustration packages. They are expected and do not affect the app.

Do not use `Flag`, `Illustration` or other `@wise/art` components: they load images from wise.com at runtime, and the demo must work with no network.

## The API contract

The contract is frozen: `backend/app/schemas.py`, the route paths, `frontend/src/api/schema.d.ts`, `frontend/src/api/client.ts` and the route table in `frontend/src/App.tsx`. Changes go through the tech lead.

Until a real handler lands, each route returns a fixed example payload from `backend/app/stubs.py`, so the frontend can be built against the running backend from day one.

After a contract change, with the backend running:

```bash
cd frontend && npm run gen:api
```

## Team rules

- Branches by role: `fe/*`, `be/*`, `engine/*`, `demo/*`. Merge into `main` after every task.
- Each file has one owner; see "File ownership" in the shared plan.
- Synthetic data only.
- Add a line to [docs/ai-usage.md](docs/ai-usage.md) saying where you used AI.
