# Wise Tax Jar — Role A: Frontend (Wise UI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Wise-styled phone-width app: Home, transactions, onboarding, live toast and question sheet, Tax Jar and pay screens.

**Shared plan:** `docs/superpowers/plans/2026-11-13-wise-tax-jar.md`. Its Global Constraints, Decisions and Review Focus apply to every task here. Task S0 in that file must be in `main` before you start.

**Spec:** `roadmap-tax-jar-en.md` (repo root).

**Branch prefix:** `fe/*`. Merge into `main` after every task.

**You own (nobody else edits these):** everything in `frontend/src/` except `api/client.ts`, `api/schema.d.ts` (tech lead) and `screens/Simulator.tsx` (role D).

**What you wait for:**

| Your task | Needs | Until then |
|---|---|---|
| A1, A2 | S0 only | The S0 stubs return contract-shaped data, so build against them. |
| A3 Step 6 (hand check) | B3, B4 | Build and unit-test against the stub; do the hand check when B4 is in `main`. |
| A4 | C4 for real totals, B5 for Undo | Build against the stubbed `GET /api/tax/summary`. |
| A5 | B6, C5 | Build against the stubs. |

**Review Focus items that land in your tasks:** the UI side of 1 (buttons disabled while a request is in flight) and 2 (no `Needs your answer` tag before onboarding).

Tasks are in the order to do them. Cut from the bottom: Could first, then Should.

---

### Task A1 · Must: App shell, Home, transactions

**Files:**
- Create: `frontend/src/lib/money.ts`, `src/lib/why.ts`, `src/copy.ts`, `src/state/useLiveData.ts`, `src/components/PhoneFrame.tsx`, `BottomNav.tsx`, `TransactionRow.tsx`, `src/screens/Home.tsx`, `TransactionDetail.tsx`
- Modify: `frontend/src/App.tsx` (wrap the routes in `PhoneFrame` and `LiveDataProvider`), the Home and TransactionDetail placeholders
- Test: `frontend/src/lib/money.test.ts`, `src/lib/why.test.ts`

**Interfaces — Produces:**

```ts
// lib/money.ts
formatMoney(amountMinor: number, currency: string): string
// lib/why.ts
whyLine(reasons: string[]): string                 // "Why: a · b"; "" for an empty list
tagFor(t: Transaction, profileEnabled: boolean): "Tax set aside" | "Personal" | "Needs your answer" | null
// api/client.ts (already written in Task S0) — one typed function per route, types from schema.d.ts; each throws ApiError {code, message}
getAccount, getTransactions, getTaxProfile, putTaxProfile, getCountries, simulateIncoming,
answerTransaction, undoTransaction, getTaxSummary, payTax, resetDemo
// state/useLiveData.ts
LiveDataProvider                                    // mounted once in App.tsx; owns all fetching
useLiveData(): { account, transactions, profile, loading, refresh, version }   // reads the provider's context
```

Routes: `/` Home, `/transactions/:id`, `/onboarding`, `/tax-jar`, `/tax-jar/pay` inside `PhoneFrame` (390px wide, centred, `Hackathon prototype` label at the bottom); `/simulator` outside it. `tagFor` returns `Tax set aside` when the reservation status is `reserved` or `paid`, `Needs your answer` for label `unknown` when `profileEnabled` is true, `Personal` for label `personal` on incoming transactions, otherwise `null`.

- [ ] **Step 1: Write the failing tests.**

```ts
// money.test.ts
expect(formatMoney(27600, "EUR")).toBe("€276");
expect(formatMoney(27650, "EUR")).toBe("€276.50");
expect(formatMoney(150000, "USD")).toBe("$1,500");
expect(formatMoney(2300, "EUR")).toBe("€23");
expect(formatMoney(90000, "GBP")).toBe("£900");
// why.test.ts
expect(whyLine(["company sender", "invoice in reference"])).toBe("Why: company sender · invoice in reference");
expect(whyLine([])).toBe("");
// tagFor: reserved → "Tax set aside"; label unknown → "Needs your answer", or null when profileEnabled is false; personal incoming → "Personal"; outgoing → null
```

- [ ] **Step 2: Run `npm test`, expect FAIL. Step 3: Implement the two libs. Step 4: Run, expect PASS.**
- [ ] **Step 5: Build the screens.** Home shows a balance card per currency, the Jars section (the Tax Jar gets its own icon and links to `/tax-jar`) and the transaction list (avatar, name, signed amount, tag). The detail screen shows amount, payer, reference, the `whyLine`, and the reservation breakdown (source amount, rate, FX rate, reserved amount) when there is one. Use a Neptune component wherever the package exports a matching one (check its exports, not memory); otherwise `neptune-css` classes. Loading and empty states on both screens.
- [ ] **Step 6: Checkpoint 1.** With the backend running, Home shows the seed balances, jars and about 15 transactions; a detail screen opens. All backend and frontend tests pass.
- [ ] **Step 7: Commit** `feat(fe): app shell, home and transactions`.

### Task A2 · Must: Onboarding

**Files:**
- Create: `frontend/src/screens/Onboarding.tsx`
- Modify: `frontend/src/App.tsx`, `src/copy.ts`

**Interfaces:** Consumes `getCountries`, `putTaxProfile`, `useLiveData().profile`.

- [ ] **Step 1: Build three steps:** country; regime (shows the regime's `hint`); rate and tax currency on one screen (rate pre-filled from `defaultRate`, shown as a percentage, editable from 0 to 100; currency one of EUR, USD, GBP, default EUR). The disclaimer is on the last step. The final button sends `putTaxProfile({ ..., enabled: true })`, calls `refresh()` and returns to Home.
- [ ] **Step 2: Add the entry point.** While `profile.enabled` is false, Home shows a card `Set money aside for taxes automatically` with a `Set up` button that opens `/onboarding`.
- [ ] **Step 3: Verify by hand.** Reset the demo, tap through Estonia → Entrepreneur account → 20% and EUR; the card disappears and `GET /api/tax-profile` returns `enabled: true`, `rate: 2000`. A server error shows its `message` on the screen.
- [ ] **Step 4: Commit** `feat(fe): tax onboarding`.

### Task A3 · Must: Live updates, toast, question sheet

**Files:**
- Create: `frontend/src/api/events.ts`, `src/components/TaxToast.tsx`, `WorkQuestionSheet.tsx`
- Modify: `frontend/src/state/useLiveData.ts`, `src/App.tsx`, `src/screens/TransactionDetail.tsx`
- Test: `frontend/src/api/events.test.ts`

**Interfaces — Produces:**

```ts
// api/events.ts
type AppEvent = { type: "transaction.created" | "reservation.created" | "question.asked" | "reservation.undone";
                  transaction: Transaction } | { type: "demo.reset" };
subscribe(onEvent: (e: AppEvent) => void): () => void      // wraps EventSource("/api/events"); returns unsubscribe
parseEvent(type: string, data: string): AppEvent | null    // null for unknown types or bad JSON
```

- [ ] **Step 1: Write the failing test** for `parseEvent`: a `reservation.created` frame returns the typed event; an unknown type and malformed JSON both return `null`.
- [ ] **Step 2: Run, expect FAIL. Step 3: Implement `events.ts`. Step 4: Run, expect PASS.**
- [ ] **Step 5: Wire the UI.** `LiveDataProvider` opens the only `EventSource` in the app, and on every event calls `refresh()` and increments `version`. No other component subscribes; they read events through the provider. `reservation.created` shows `TaxToast`: `{formatMoney(reservedAmount, taxCurrency)} set aside for taxes`, with the `whyLine` under it, for 6 seconds. `question.asked` opens `WorkQuestionSheet`: title `Is this payment for work?`, body `{name} sent you {amount} · {reference}`, buttons `Yes` and `No`, each disabled while its request is in flight, calling `answerTransaction`, then `refresh()`, and closing on success. A transaction with the tag `Needs your answer` reopens the sheet from its detail screen. `demo.reset` closes any toast or sheet.
- [ ] **Step 6: Verify by hand** with `curl -X POST localhost:8000/api/simulate/incoming` for Acme, Mari and John: toast `€276 set aside for taxes` with `Why: company sender · invoice in reference`; Mari appears tagged `Personal` with no toast; John opens the sheet and `Yes` produces a toast for `€80`.
- [ ] **Step 7: Commit** `feat(fe): live updates, tax toast and work question sheet`.

### Task A4 · Should: Tax Jar screen and Undo

**Files:**
- Create: `frontend/src/screens/TaxJar.tsx`, `src/components/MonthlyBars.tsx`
- Modify: `src/components/TaxToast.tsx`, `src/screens/TransactionDetail.tsx`, `src/components/BottomNav.tsx`

**Interfaces:** Consumes `getTaxSummary`, `undoTransaction`, `useLiveData`.

- [ ] **Step 1: Build the screen:** total set aside, `MonthlyBars` (plain flex bars from `byMonth`, no chart library), next deadline (hidden when `null`), the list of transactions that have a reservation with each one's status, the disclaimer. It refetches the summary whenever `useLiveData().version` changes. Empty state: `Nothing set aside yet. Income you receive will show up here.`
- [ ] **Step 2: Add Undo.** The toast gets an `Undo` button and the detail screen gets `This wasn't income`, both calling `undoTransaction` and shown only while the reservation status is `reserved`. `reservation.undone` dismisses the toast.
- [ ] **Step 3: Verify by hand.** Acme then John (Yes): the total reads `€356`. Undo Acme from its detail screen: the total reads `€80`, the USD balance goes up by `$300`, Acme is tagged `Personal`.
- [ ] **Step 4: Commit** `feat(fe): tax jar screen and undo`.

### Task A5 · Could: Pay screen and export link

**Files:**
- Create: `frontend/src/screens/PayTax.tsx`
- Modify: `frontend/src/screens/TaxJar.tsx`

- [ ] **Step 1: Build it.** The Tax Jar screen gets a `Pay tax` button (disabled when the total is 0) and an `Export CSV` link to `/api/tax/export.csv`. `/tax-jar/pay` is a pre-filled confirmation: recipient `Tax authority (demo)`, amount, reference `Tax payment`, the disclaimer, a `Confirm` button that calls `payTax`, then a success state and a link back.
- [ ] **Step 2: Checkpoint 3.** Run the full golden path, steps 1–6, from a reset, including payment and a downloaded CSV that opens in a spreadsheet.
- [ ] **Step 3: Commit** `feat(fe): pay tax screen and CSV export`.
