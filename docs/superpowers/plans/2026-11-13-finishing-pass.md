# Finishing Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close everything left before the demo except role D's human tasks: the tax breakdown on Home, a usable setup, accents, CSV split, payer history, polish and cleanup.

**Architecture:** Backend changes stay inside `backend/app/summary.py`, `backend/app/pipeline.py` and `backend/app/engine/countries.json`, each test-first with pytest. App changes are in `prototype/src`; the app has no unit tests, so every app task is driven by new assertions in `prototype/scripts/golden.mjs` (Playwright, real backend), written first and watched fail.

**Tech Stack:** FastAPI, SQLModel, pytest · React 19, TypeScript, Tailwind, Vite, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-finishing-pass-design.md`

## Global Constraints

- The golden path must pass after every task: `cd prototype && node scripts/golden.mjs` with the backend on :8000 and `npm run dev` on :5199. It prints `GOLDEN PATH PASSED` and exits 0, with no console errors.
- No contract changes: `backend/app/schemas.py` and the route list stay as they are in `main`.
- Nothing loads from the network. The disclaimer `An estimate for setting money aside, not tax advice.` and the `Hackathon prototype` label stay.
- The Acme toast's why line stays exactly `company sender · invoice in reference`; John (`John Smith`, 40000 EUR, `website`) must still get `Is this payment for work?`.
- Amounts are minor units; the app formats with `formatMoney` from `prototype/src/lib/money.ts`.
- Backend tests: `cd backend && .venv/bin/pytest -q`. App checks: `cd prototype && npm run build && npx oxlint`.

## Review Focus

1. Payer history makes a known demo payer change label (Mari from personal to unknown, John to income) on a fresh reset — Task 2 pins Mari, John and Acme on the seed.
2. A reservation whose rate no longer matches the regime's split (user set 25%): CSV and Home show no amounts, only the rule — Task 1 and Task 3 test it.
3. The country search with a query that matches nothing: the step shows "No country matches" and Continue stays disabled — Task 4 tests it.
4. Switching the demo state back to "Not set up" after "Live": setup starts again and the picker reads "Not set up" — Task 5 tests it.
5. A past income row whose reservation was undone: it shows "Personal", not "Income" — Task 5 tests it.

---

### Task 1: CSV tax breakdown and Estonian spellings

**Files:**
- Modify: `backend/app/summary.py` (`CSV_HEADER`, `export_rows`)
- Modify: `backend/app/engine/countries.json` (the two EE regime `name` fields only)
- Test: `backend/tests/test_export.py`, `backend/tests/test_read_api.py`

**Interfaces:**
- Consumes: `db.to_reservation(row)`, which already returns `breakdown: list[TaxPart] | None` (from the regime the reservation was made under).
- Produces: CSV header gains a last column `tax_breakdown`. Cell: parts joined by `"; "`, each `"<name> <amount>"` with the amount from `format_minor(part.amount, tax_currency)`, e.g. `Income tax 110.40; Social tax 165.60`. Empty when the breakdown is `None`.

- [ ] **Step 1: Write the failing tests.**

```python
# test_export.py
def test_csv_carries_the_exact_split(client, onboarded):
    # Acme → second line ends with ",reserved,Income tax 110.40; Social tax 165.60"
def test_csv_split_empty_without_exact_split(client, onboarded):
    # PUT profile regime "fie", rate 4500; Nordwind GmbH 220000 EUR "Rechnung 2026-118"
    # → row's last field == ""
def test_csv_split_empty_at_off_rate(client, onboarded):
    # PUT entrepreneur_account rate 2500 (not 2000/2200/2400/2600); Acme → last field == ""
# test_read_api.py
def test_estonian_names_keep_their_accents(client):
    # EE regimes: one name contains "ettevõtluskonto", the other "füüsilisest isikust ettevõtja"
```

Update `test_csv_export`'s expected line and header for the new column.

- [ ] **Step 2: Run** `.venv/bin/pytest -q tests/test_export.py tests/test_read_api.py`. Expected: the four new tests FAIL.
- [ ] **Step 3: Implement.** Append the column in `export_rows` using `db.to_reservation(reservation).breakdown`. In `countries.json` set the names to `Sole proprietor (FIE, füüsilisest isikust ettevõtja), general regime` and `Entrepreneur account (ettevõtluskonto), simplified business income taxation`.
- [ ] **Step 4: Run the whole backend suite.** Expected: all pass.
- [ ] **Step 5: Commit** `feat(engine): tax breakdown in the CSV and Estonian spellings`.

### Task 2: Payer history in the classifier

**Files:**
- Modify: `backend/app/pipeline.py` (`process_incoming`)
- Test: `backend/tests/test_pipeline.py`

**Interfaces:**
- Consumes: `app.engine.payer_history(sender_name, past_payments)`, `app.engine.owner_context(home_currency, income_amounts)`, `classifier.classify(..., currency=, history=, owner=, now=)`.
- Produces: `process_incoming` passes `currency`, `history` (earlier incoming `TransactionRow`s with the same `counterparty_key`, as dicts `{name, created_at, amount, currency}`), `owner=OwnerContext(home_currency=None, typical_income_minor=owner_context(None, <amounts of incoming rows labelled income in profile.tax_currency>).typical_income_minor)` and `now=datetime.now(timezone.utc)`.

`home_currency` is passed as `None` on purpose: with it, Acme gains the reason `paid in a foreign currency` and the pitched why line changes (Global Constraints).

- [ ] **Step 1: Write the failing tests.**

```python
def test_regular_client_needs_no_question(client, onboarded, session):
    # insert 3 incoming TransactionRows from "Oskar Ilves" (person), 60000 EUR, created 3, 2 and 1 months ago,
    #   label "income", with a CounterpartyRow (status None)
    # POST Oskar Ilves 60000 EUR "March" → label "income"; "this payer has paid you before" in reasons
def test_demo_payers_keep_their_labels_with_history(client, onboarded):
    # fresh seed: Acme → income, reasons == ["company sender", "invoice in reference"]
    # Mari Tamm (person) 2300 EUR "pizza 🍕" → personal; John Smith 40000 EUR "website" → unknown
```

- [ ] **Step 2: Run** `.venv/bin/pytest -q tests/test_pipeline.py`. Expected: `test_regular_client_needs_no_question` FAILS (no history passed); the demo-payers test passes already and must keep passing.
- [ ] **Step 3: Implement** in `process_incoming`, querying before the new row is added.
- [ ] **Step 4: Run the whole backend suite, then the golden path.** Expected: all pass; golden prints `GOLDEN PATH PASSED`. If John stops getting the question, revert this task and record why.
- [ ] **Step 5: Commit** `feat(be): classify with the payer's history`.

### Task 3: Breakdown on the Home panel

**Files:**
- Modify: `prototype/src/components/TaxJarPanel.tsx`
- Test: `prototype/scripts/golden.mjs`

**Interfaces:**
- Consumes: `useStore().summary.breakdown: TaxPart[] | null`, `summary.breakdownRule: string` (already in the store from skurbro's commit), `formatMoney(amount, currency, { cents: true })`.
- Produces: under "set aside for taxes", a line `€110.40 income tax · €165.60 social tax` when `breakdown` has parts and the total is above 0; otherwise the rule in words (`breakdownRule`) when it is not empty; nothing when the jar is empty.

- [ ] **Step 1: Add the failing assertions to `golden.mjs`.**
  - After `panel shows €276`: `expectText(panel(), /€110\.40 income tax · €165\.60 social tax/, 'panel split')`.
  - After `Acme toast`: `expectText(page.getByRole('status'), /€110\.40 income tax · €165\.60 social tax/, 'toast split')` (pins skurbro's toast line).
  - After `panel shows €356`: `expectText(panel(), /€142\.40 income tax · €213\.60 social tax/, 'panel split after John')`.
- [ ] **Step 2: Run the golden path.** Expected: FAIL at `panel split` (toast split passes already).
- [ ] **Step 3: Implement** the line in `TaxJarPanel`, same formatting as the Tax Jar page.
- [ ] **Step 4: Run the golden path, build and lint.** Expected: `GOLDEN PATH PASSED`; build succeeds; no new lint warnings.
- [ ] **Step 5: Commit** `feat(fe): tax breakdown on the Home panel`.

### Task 4: Setup with 80 countries

**Files:**
- Modify: `prototype/src/screens/Setup.tsx`
- Modify: `prototype/src/components/ui.tsx` (add `CountryBadge`)
- Test: `prototype/scripts/golden.mjs`

**Interfaces:**
- Produces: `CountryBadge({ code }: { code: string })` — a rounded square with the 2-letter code (`*` shows `🌐`-free text `ALL`), no emoji. Remove `FLAG_EMOJI`.
- Step 1 of setup: a text input labelled `Search countries` above the list; filters case-insensitively on name or code; Estonia always first, then A–Z, `Other` last; the list scrolls inside the step (max height ~60vh); with no match it shows `No country matches “<query>”` and Continue stays disabled.
- Step 2: each regime shows name, rate and `breakdownRule`; the long `hint` sits behind a `How we got this` button (`aria-expanded`), collapsed by default.

- [ ] **Step 1: Add the failing assertions to `golden.mjs`** at the start of section 1, before choosing Estonia:
  - The first radio in the country list is Estonia: `expect((await page.getByRole('radio').first().textContent())).toMatch(/Estonia/)` written as a plain check that throws.
  - Fill `Search countries` with `zzz` → `No country matches` visible and Continue disabled; then fill `est` → exactly one radio, Estonia.
  - On step 2, the text `Derived:` is not visible until `How we got this` is clicked.
- [ ] **Step 2: Run the golden path.** Expected: FAIL at the first new check.
- [ ] **Step 3: Implement** the search, ordering, badge and toggle.
- [ ] **Step 4: Run the golden path, build and lint.** Expected: pass, and a screenshot `golden-1-setup-done.png` shows no box glyphs.
- [ ] **Step 5: Commit** `feat(fe): searchable country step and short regime cards`.

### Task 5: Demo-controls picker and past-income tag

**Files:**
- Modify: `prototype/src/data/store.tsx` (`saveProfile`), `prototype/src/data/engine.ts` (`Tag`, `tagFor`), `prototype/src/components/ui.tsx` (tag colour for `Income`)
- Test: `prototype/scripts/golden.mjs`

**Interfaces:**
- Produces: after `saveProfile` succeeds with `enabled: true`, `preset` becomes `'live'`. `Tag` gains `'Income'`; `tagFor` returns `'Income'` for an incoming transaction labelled `income` with no reservation; a row whose reservation is `undone` is labelled personal by the backend and keeps `'Personal'`.

- [ ] **Step 1: Add the failing assertions to `golden.mjs`.**
  - After setup: `aside select` has value `live`.
  - On Home after setup: the row `Harbourline Ltd` contains `Income`.
  - After the undo in section 6: the undone Acme row on Home shows `Personal`, not `Income`.
  - At the end: select `Not set up` → the `Set up in 3 steps` button is visible and the picker value is `not-set-up`.
- [ ] **Step 2: Run the golden path.** Expected: FAIL at the picker check.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the golden path, build and lint.** Expected: pass.
- [ ] **Step 5: Commit** `fix(fe): picker reads Live after setup; tag past income`.

### Task 6: Cleanup and docs

**Files:**
- Delete: `frontend/`, `backend/app/stubs.py`
- Modify: `README.md`, `docs/superpowers/plans/2026-11-13-wise-tax-jar.md` (File ownership: `prototype/` belongs to role A; `frontend/` removed), `docs/superpowers/specs/2026-11-13-finishing-pass-design.md` (CSV is one `tax_breakdown` column), `docs/ai-usage.md` (one line for this pass)

- [ ] **Step 1: Check nothing imports what is deleted.** Run `grep -rn "stubs\|frontend/" backend prototype --include=*.py --include=*.ts --include=*.tsx --include=*.json`. Expected: no hits outside comments.
- [ ] **Step 2: Delete and update the docs.** README: run the backend on :8000, then `cd prototype && npm install && npm run dev` on http://localhost:5199; Node 24 (22.22+ works); golden path command with `npx playwright install chromium` once; the Neptune, flags and `gen:api` paragraphs go.
- [ ] **Step 3: Run the backend suite and the golden path.** Expected: all pass.
- [ ] **Step 4: Commit** `chore: remove the unused frontend and stubs; README runs the prototype`.
