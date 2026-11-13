# Wise Tax Jar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Wise-styled web prototype that classifies incoming payments as work income or personal and moves a tax percentage into a Tax Jar in the tax currency, good enough to run the roadmap's 5-step live demo.

**Architecture:** A FastAPI backend owns all money logic: a payment pipeline saves the transaction, calls a pure rule-based classifier, reserves tax through one reservations module, and publishes events on an in-memory bus exposed as SSE. A React app (phone-width frame) renders account state and refetches on every event; a simulator page in the same app posts demo payments. Tax rules and FX rates are config, with nothing external at runtime.

**Tech Stack:** Python 3.10, FastAPI, Pydantic v2, SQLModel, SQLite, pytest · React, TypeScript, Vite, Vitest, `@transferwise/components`, `@transferwise/neptune-css`, `@transferwise/neptune-tokens`, `openapi-typescript`.

**Spec:** `roadmap-tax-jar-en.md` (repo root). Read sections 1, 4, 5 and 7 before any task.

**How this plan is split:** this file holds what all four roles share (constraints, decisions, the contract task S0, ownership and hand-offs). Each role's tasks are in its own file, listed under Role files below.

## Global Constraints

- Amounts are integers in minor units (cents) everywhere: DB, API, events. Only the CSV export and the UI format to major units.
- Every error response is `{ "error": { "code": string, "message": string } }`, including validation errors.
- Synthetic data only. No real people, client names, companies or documents.
- The disclaimer string is exactly `An estimate for setting money aside, not tax advice.` and appears on onboarding, the Tax Jar screen and the pay screen.
- Every app screen shows the label `Hackathon prototype` at the bottom. Do not deploy the app publicly.
- Nothing on the demo path calls the network: no external FX, no LLM, no CDN fonts or scripts.
- JSON field names are camelCase (`senderName`, `isIncome`, `taxCurrency`). Python uses snake_case with a camelCase alias generator.
- All FastAPI route handlers are `async def`, so `EventBus.publish` runs on the event loop thread.
- Python code must run on 3.10 (no `datetime.UTC`, no `StrEnum`).
- Rates are integer basis points: `2000` means 20%. Classifier scores, weights and thresholds are integer hundredths: `80` means 0.80.
- Branch prefixes by role: `fe/*` (A), `be/*` (B), `engine/*` (C), `demo/*` (D). Each role has its own plan file.
- Each contributor adds a line to `docs/ai-usage.md` saying where AI was used.
- The repo root is the monorepo root (the roadmap calls it `wise-tax-jar/`).

## Decisions this plan makes beyond the spec

1. **Classifier baseline of 30.** With the section 5 weights alone, `John Smith · €400 · website` scores 0.15 and is marked personal, so demo step 4 (the bottom sheet) never appears. Every payment therefore starts at 30. John scores 45 (ask), Acme 110 → 100 (income), Mari −35 → 0 (personal).
2. **FX table:** USD→EUR 0.92 (this is what makes the toast read €276), GBP→EUR 1.15.
3. **Tax is taken from the balance the payment arrived in** and converted into the Tax Jar. Undo returns the source amount to that balance.
4. **Before onboarding the profile is disabled:** payments are saved and classified, but nothing is reserved and no question is asked.
5. **Repeat taps are harmless:** a second answer or a second undo returns 200 with the current state and moves no money.
6. **Additions to the contract:** the event `demo.reset`, and `reservation` embedded in each transaction.
7. **Deadline rules** in `countries.json` (monthly on the 10th for the entrepreneur account, quarterly on the 15th for FIE) are placeholders until role D verifies them against official sources.

## Review Focus

1. Double tap on Yes/No or on Undo: one reservation, one money move, 200 both times (Tasks B4, B5).
2. Payment arrives before onboarding or with the profile disabled: balance is credited, no reservation, no question (Task B4).
3. Simulator sends an unsupported currency, a zero or negative amount, or a blank sender: 422 in the error format, nothing saved (Task B4).
4. Undo after the tax was paid: 409 `reservation_paid`, no money moves (Task B6).
5. Profile edited badly: rate outside 0–10000 is rejected; changing the tax currency while the Tax Jar holds money is rejected; a 0% rate creates no reservation and no toast (Tasks B2, B4).

## Role files

Each role works from its own plan file, on its own branch prefix, in its own files.

| Role | Plan file | Tasks |
|---|---|---|
| Tech lead, then everyone | this file | S0 |
| A. Frontend | `2026-11-13-wise-tax-jar-a-frontend.md` | A1 shell, Home, transactions · A2 onboarding · A3 live updates, toast, sheet · A4 Tax Jar screen, undo · A5 pay screen |
| B. Backend & API | `2026-11-13-wise-tax-jar-b-backend.md` | B1 FX · B2 storage, read API, profile · B3 events · B4 pipeline · B5 undo · B6 pay |
| C. Tax Engine | `2026-11-13-wise-tax-jar-c-engine.md` | C1 classifier · C2 tax rules · C3 invariants, pipeline review · C4 summary · C5 CSV export |
| D. Product & Demo | `2026-11-13-wise-tax-jar-d-demo.md` | D1 seed · D2 scenarios, simulator · D3 demo readiness |

## File ownership

One owner per file, so branches do not collide. Anything not listed belongs to whoever creates it in their own task.

```
backend/app/main.py, schemas.py                      tech lead in S0; then B (main.py). schemas.py is frozen.
backend/app/models.py, db.py, fx.py, events.py,
            pipeline.py, reservations.py             B
backend/app/routes/core.py, routes/payments.py       B
backend/app/routes/reports.py, summary.py            C
backend/app/engine/                                  C
backend/tests/conftest.py                            B
backend/tests/invariants.py                          C
frontend/src/api/client.ts, schema.d.ts              tech lead in S0; frozen with the contract
frontend/src/screens/Simulator.tsx                   D
frontend/src/ (everything else)                      A
demo/, docs/                                         D
```

## Hand-offs between roles

These are the only points where one role waits for another. Announce each in the team chat when it reaches `main`.

| When this is in `main` | These can proceed |
|---|---|
| S0 (scaffold, stubs, `client.ts`, route table) | A1, B1, C1, C2, D1 all start at once |
| D1 seed, C2 tax rules | B2 |
| B2 storage | C3 Step 1 (invariant helper), C4 |
| C1 classifier, C2, B2, B3 | B4 |
| B4 pipeline | A3 hand check, C3 test and review, C5, D2 scenario test |
| A3, B4, D2 | **Checkpoint 2:** golden path steps 1–4 (the Must line) |
| B5 undo, C4 summary | A4 against real data |
| B6 pay, C5 export | A5, then **Checkpoint 3** |

Checkpoint 1 (roadmap T+5h) is A1 + B2 + C1 in `main`: the app shows real seed data and the classifier passes its tests.

---

### Task S0 · Must: Scaffold and frozen contract (tech lead, before anyone branches)

**Files:**
- Create: `backend/requirements.txt`, `backend/pytest.ini`, `backend/app/main.py`, `backend/app/schemas.py`, `backend/app/routes/core.py`, `backend/app/routes/payments.py`, `backend/app/routes/reports.py`, `frontend/src/api/client.ts`, one placeholder file per screen in `frontend/src/screens/`, `backend/tests/conftest.py`, `backend/tests/test_contract.py`, `frontend/` (Vite app), `README.md`, `.gitignore`, `docs/ai-usage.md`

**Interfaces — Produces (`backend/app/schemas.py`, all with camelCase aliases):**

```python
Label = Literal["income", "personal", "unknown"]
class TaxProfile:      country: str; regime: str; rate: int; tax_currency: str; enabled: bool   # rate in bp
class Balance:         currency: str; amount: int
class Jar:             id: str; name: str; currency: str; balance: int; type: Literal["tax", "regular"]
class Counterparty:    name: str; kind: Literal["company", "person", "unknown"]; is_known_client: bool
class Classification:  label: Label; confidence: float; reasons: list[str]
class TaxReservation:  id: str; transaction_id: str; source_amount: int; source_currency: str; rate: int
                       fx_rate: float; reserved_amount: int; tax_currency: str
                       status: Literal["reserved", "undone", "paid"]
class Transaction:     id: str; direction: Literal["in", "out"]; amount: int; currency: str
                       counterparty: Counterparty; reference: str; created_at: datetime
                       classification: Classification; reservation_id: str | None
                       reservation: TaxReservation | None
class Account:         owner: str; balances: list[Balance]; jars: list[Jar]
class Regime:          id: str; name: str; default_rate: int; hint: str
class Country:         code: str; name: str; regimes: list[Regime]
class SimulateIncoming: sender_name: str; sender_kind: Literal["company","person","unknown"] | None = None
                       amount: int; currency: str; reference: str = ""
class Answer:          is_income: bool
class MonthTotal:      month: str; reserved: int                    # month as "YYYY-MM"
class TaxSummary:      tax_currency: str; total_reserved: int; total_paid: int; by_month: list[MonthTotal]
                       estimated_due: int; next_deadline: date | None; disclaimer: str
class PayResult:       transaction: Transaction; paid_amount: int; currency: str
class ErrorBody:       code: str; message: str
class ErrorResponse:   error: ErrorBody
```

Routes, all under `/api`, exactly as the roadmap's contract table: `GET /account → Account`, `GET /transactions → list[Transaction]` (newest first), `GET|PUT /tax-profile → TaxProfile`, `GET /tax/countries → list[Country]`, `POST /simulate/incoming → Transaction`, `POST /transactions/{id}/answer → Transaction`, `POST /transactions/{id}/undo → Transaction`, `GET /tax/summary → TaxSummary`, `POST /tax/pay → PayResult`, `GET /tax/export.csv`, `POST /demo/reset → Account`, `GET /events` (SSE).

SSE frame: `event: <type>\ndata: <json>\n\n`. Types: `transaction.created`, `reservation.created`, `question.asked`, `reservation.undone` with data `{ "transaction": Transaction }`; `demo.reset` with data `{}`.

- [ ] **Step 1: Check the toolchain.** Run `python3 --version` (need 3.10+) and `node --version` (need 20+). Node was not on PATH when this plan was written; install it with nvm if it is missing.
- [ ] **Step 2: Create the backend.** `python3 -m venv backend/.venv`, then `requirements.txt` with `fastapi`, `uvicorn[standard]`, `sqlmodel`, `pytest`, `httpx`, and `.venv/bin/pip install -r requirements.txt`. Add `pytest.ini` with `pythonpath = .` and `testpaths = tests`, and a `tests/conftest.py` with one fixture, `client`, that returns `TestClient(create_app())`. Write `schemas.py` as above. In `main.py` write `create_app() -> FastAPI` and a module-level `app` that includes three routers, so that roles never edit the same file: `routes/core.py` (account, transactions, tax-profile, tax/countries, demo/reset, events), `routes/payments.py` (simulate/incoming, answer, undo, tax/pay) and `routes/reports.py` (tax/summary, tax/export.csv). Every route is declared with its response model and returns one fixed, contract-shaped example payload. These stubs are the frontend's mocks until the real handlers land.
- [ ] **Step 3: Write `backend/tests/test_contract.py`.**

```python
def test_openapi_lists_every_contract_path(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert set(paths) >= {"/api/account", "/api/transactions", "/api/tax-profile", "/api/tax/countries",
        "/api/simulate/incoming", "/api/transactions/{id}/answer", "/api/transactions/{id}/undo",
        "/api/tax/summary", "/api/tax/pay", "/api/tax/export.csv", "/api/demo/reset", "/api/events"}

def test_json_is_camel_case(client):
    assert "taxCurrency" in client.get("/api/tax-profile").json()
```

- [ ] **Step 4: Run `cd backend && .venv/bin/pytest -q`.** Expected: 2 passed.
- [ ] **Step 5: Create the frontend.** `npm create vite@latest frontend -- --template react-ts`. Before installing Neptune, run `npm view @transferwise/components peerDependencies` and install the React major it asks for. Install the three Neptune packages, `react-router-dom`, `vitest`, `@testing-library/react`, `jsdom`, `openapi-typescript`. If the components package will not build within the first hour, drop it and use `neptune-css` plus tokens only (roadmap section 9).
- [ ] **Step 6: Wire the two halves.** In `vite.config.ts` proxy `/api` to `http://localhost:8000` and set `server.fs.allow: ['..']`. Add the npm script `"gen:api": "openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts"` and commit the generated file. Write `src/api/client.ts`: one typed function per route (`getAccount`, `getTransactions`, `getTaxProfile`, `putTaxProfile`, `getCountries`, `simulateIncoming`, `answerTransaction`, `undoTransaction`, `getTaxSummary`, `payTax`, `resetDemo`), types from `schema.d.ts`, each throwing `ApiError { code, message }` on an error response. In `App.tsx` register every route (`/`, `/transactions/:id`, `/onboarding`, `/tax-jar`, `/tax-jar/pay`, `/simulator`) with a placeholder screen file each, so later tasks replace a screen file and never edit the route table. The Home placeholder renders one Neptune button showing the owner name from `getAccount()`.
- [ ] **Step 7: Write `README.md`** with the run commands (`uvicorn app.main:app --reload --port 8000` from `backend/`, `npm run dev` from `frontend/`, both test commands, `npm run gen:api`) and `docs/ai-usage.md` with a heading and one line per contributor.
- [ ] **Step 8: Checkpoint 0.** Both servers start, the page shows the stub owner name in a Neptune button, `pytest` passes.
- [ ] **Step 9: Commit** `chore: scaffold monorepo and freeze API contract`. From here the contract changes only through the tech lead.
