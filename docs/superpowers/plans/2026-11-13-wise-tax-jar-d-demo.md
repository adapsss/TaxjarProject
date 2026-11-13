# Wise Tax Jar — Role D: Product, Demo & Pitch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The seed data, the demo scenarios and simulator page, verified tax facts, and everything needed to run the live demo.

**Shared plan:** `docs/superpowers/plans/2026-11-13-wise-tax-jar.md`. Its Global Constraints, Decisions and Review Focus apply to every task here. Task S0 in that file must be in `main` before you start.

**Spec:** `roadmap-tax-jar-en.md` (repo root).

**Branch prefix:** `demo/*`. Merge into `main` after every task.

**You own (nobody else edits these):** `demo/`, `docs/`, `frontend/src/screens/Simulator.tsx`, `backend/tests/test_scenarios.py`. You also review `frontend/src/copy.ts` (role A writes it).

**What you wait for:**

| Your task | Needs | Until then |
|---|---|---|
| D1 | S0 only | Do it first; role B is waiting for it. |
| D2 Steps 1–4 (scenario test) | B4, C3 Step 1 | Write `scenarios.json` and build the page (Step 5) against the stubs. |
| D2 Step 6 (Checkpoint 2) | A3, B4 | Start the pitch skeleton and the rate verification from D3. |
| D3 | everything | The verification and pitch items do not depend on code; start them early. |

**Review Focus items that land in your tasks:** none directly; the D2 scenario test exercises the classifier and pipeline end to end.

Tasks are in the order to do them. Cut from the bottom: Could first, then Should.

---

### Task D1 · Must: Seed data

**Files:**
- Create: `demo/seed.json`
- Modify: `docs/ai-usage.md`

**Interfaces — Produces:** `demo/seed.json`, read by `db.reset_to_seed` in Task B2. Shape: `{ "owner": str, "profile": {country, regime, rate, taxCurrency, enabled}, "balances": [{currency, amount}], "jars": [{id, name, currency, balance, type}], "transactions": [{direction, amount, currency, senderName, senderKind, reference, createdAt, label}] }`.

Do this first: role B cannot finish Task B2 without it.

- [ ] **Step 1: Write the file** with exactly these values: owner `Kadri Saar`; balances EUR 245000, USD 32000, GBP 15000; jars `Holiday` EUR 60000, `New laptop` EUR 35000, `Tax Jar` (id `tax`, type `tax`) EUR 0; profile `EE / entrepreneur_account / 2000 / EUR`, `enabled: false`; about 15 past transactions over the last three months in mixed currencies with labels already set and no reservations. All names invented.
- [ ] **Step 2: Check it.** `python3 -m json.tool demo/seed.json` prints the file without an error; the three balances and three jars match the values above; no name belongs to a real person or company.
- [ ] **Step 3: Commit** `feat(demo): seed data` and tell role B it is in `main`.

### Task D2 · Must: Simulator and demo scenarios

**Files:**
- Create: `demo/scenarios.json`
- Modify: `frontend/src/screens/Simulator.tsx` (replace the placeholder; the route already exists)
- Test: `backend/tests/test_scenarios.py`

**Interfaces:** Consumes `simulateIncoming`, `resetDemo`. `scenarios.json` is a list of `{ id, label, senderName, senderKind?, amount, currency, reference, expect }`, imported by the page straight from `../../../demo/scenarios.json`.

| id | sender | kind | amount | currency | reference | expect |
|---|---|---|---|---|---|---|
| `acme` | Acme Inc. | | 150000 | USD | INV-042 | income |
| `mari` | Mari Tamm | person | 2300 | EUR | pizza 🍕 | personal |
| `john` | John Smith | | 40000 | EUR | website | unknown |
| `nordwind` | Nordwind GmbH | | 220000 | EUR | Rechnung 2026-118 | income |
| `pihlakas` | Pihlakas Disain OÜ | | 64000 | EUR | arve 77 | income |
| `liis` | Liis Kask | person | 1200 | EUR | beer 🍺 | personal |
| `self` | Kadri Saar | | 20000 | GBP | between my accounts | personal |
| `brightside` | Brightside Ltd | | 90000 | GBP | consulting March | income |

- [ ] **Step 1: Write the failing test.** `test_every_scenario_classifies_as_expected(client, session, onboarded)`: load `demo/scenarios.json`, post each one, assert `classification.label == expect`; then `assert_invariants(session)` (`from invariants import assert_invariants`, written by role C in Task C3).
- [ ] **Step 2: Run, expect FAIL (no file). Step 3: Write `scenarios.json`. Step 4: Run, expect PASS.**
- [ ] **Step 5: Build the page:** one button per scenario showing its label, a custom payment form (sender, kind, amount in major units, currency, reference), a `Reset demo` button, and the last response or error shown as text. Full width, outside `PhoneFrame`.
- [ ] **Step 6: Checkpoint 2.** With the app in one tab and `/simulator` in another, run golden path steps 1–4 from a fresh reset. This is the Must line: if it does not work, fix it before starting any task below.
- [ ] **Step 7: Commit** `feat(demo): simulator page and scenarios`.

### Task D3 · Everyone: Demo readiness

This task has no code of its own. It tracks roadmap phases 4 and 5, which stay the source for pitch content.

- [ ] Role D checks the FIE rate, both deadline rules and the regime hints against official Estonian sources and corrects `countries.json` (and the Task C2 deadline tests) if they differ.
- [ ] `docs/pitch.md` follows roadmap section 8; `docs/qa.md` holds the section 8 Q&A table plus the classifier baseline answer.
- [ ] Run the demo with the network cable out and Wi-Fi off: no request leaves localhost.
- [ ] Three timed runs of the golden path from `Reset demo`; record a backup video of one clean run.
- [ ] Feature freeze at T+20h; bug fixes only after that.
- [ ] `docs/ai-usage.md` has a line from every contributor.
