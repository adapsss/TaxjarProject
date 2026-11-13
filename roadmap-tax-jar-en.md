# Wise Tax Jar: Hackathon Roadmap

> **Theme:** Max Ease. Removing friction from an everyday experience.
> **The idea in one sentence:** a freelancer gets paid by a client, and Wise recognises it as income on its own, then sets aside the right percentage for taxes in a separate Jar, in the tax currency, at the exchange rate at the moment the money arrived. If a friend sends money for pizza, nothing is set aside.
> **Team:** 4 people. **Timing assumes ~24 hours.** If you have less, cut phases from the bottom (see "Priorities").

---

## 1. What we show in the demo (golden path)

Every decision below serves this scenario. If a feature doesn't help show it, we don't need it.

1. **Onboarding in 3 taps:** country of tax residency (Estonia), regime (freelancer / entrepreneur account), rate (20%, adjustable), tax currency (EUR).
2. **Payment from a client.** In the simulator: `Acme Inc.` → `$1,500`, reference `INV-042`. The app immediately shows a toast: "€276 set aside for taxes", with a "why" line: company sender, invoice in the reference.
3. **Transfer from a friend.** `Mari Tamm` → `€23`, `pizza 🍕`. Nothing is reserved; the transaction is marked as personal.
4. **Unclear payment.** `John Smith` → `€400`, `website`. A bottom sheet asks "Is this payment for work?" with Yes / No buttons. We tap "Yes", the tax is reserved, and the payer is remembered as a client.
5. **Tax Jar screen:** how much is set aside, a monthly breakdown, the next deadline, a "Pay tax" button (pre-filled transfer), and a CSV export for an accountant.
6. *(optional)* **Undo:** "This wasn't income" → the money goes back to the balance.

**Pitch in one sentence:** "Estonia has already proven the model works: on an entrepreneur account (ettevõtluskonto), the bank sets aside 20% automatically. But that's one bank, one currency and one country. We do the same thing multi-currency and multi-country inside Wise, built on the Jars Wise already has."

---

## 2. Roles

| Role | Who | Responsibility | Main artifact |
|---|---|---|---|
| **A. Frontend (Wise UI)** | _____ | App shell in Wise's visual style using Neptune, all screens, toasts, bottom sheets, live updates | `frontend/` |
| **B. Backend & API** | _____ | Models, DB, REST API, incoming payment pipeline, FX, Jars, SSE events | `backend/app/` |
| **C. Tax Engine & Classifier** | _____ | "Income vs personal" classifier, per-country tax configs, learning from user answers, tests, "why" texts | `backend/app/engine/` |
| **D. Product, Demo & Pitch** | _____ | Demo script, simulator, seed data, rate verification, UI copy, QA, pitch, Q&A, AI disclosure | `demo/`, `docs/`, slides |

**Tech lead** (settles contract disputes and merges): B or C.
Tip: Artem is a natural fit for **C + tech lead**. The classifier, data privacy and explainable decisions will be the main topics in Q&A.

### Team rules
- **The API contract is frozen at T+1h.** Changes only go through the tech lead, with a heads-up in the chat.
- Until the backend is ready, the frontend works on mocks generated from the same contract.
- Merge into `main` at least every 2 hours. Branches: `fe/*`, `be/*`, `engine/*`, `demo/*`.
- **Synthetic data only.** No real bank statements, client names or documents. Nothing non-public from Veriff.
- Everyone adds a line to `docs/ai-usage.md`: where and how AI was used (the organisers require this).

---

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React + TypeScript + Vite** | Fast start, hot reload |
| UI | **`@transferwise/components` + `@transferwise/neptune-css` + `@transferwise/neptune-tokens`** | Wise's open-source design system (Neptune) gives the real look without redrawing screenshots |
| Layout | Mobile width ~390px, centred on screen | Looks like an app on a projector |
| Backend | **FastAPI + Pydantic + SQLModel + SQLite** | Automatic OpenAPI, validation, zero infrastructure |
| Frontend types | `openapi-typescript` from `/openapi.json` | One source of truth for the contract |
| Realtime | **SSE** (`/api/events`) | Simpler than WebSockets; the app updates live when the simulator sends a payment |
| FX | Fixed rate table in config | The demo doesn't depend on external APIs |
| LLM | **Not on the critical path.** At most for nicer "why" wording, with a template fallback | Hackathon Wi-Fi is unreliable |

> ⚠️ Don't publish the prototype publicly: a page indistinguishable from Wise looks like phishing outside the hackathon. Add a "Hackathon prototype" label at the bottom of the screen.

---

## 4. Architecture

```
┌──────────────────────┐      ┌────────────────────────────────────────┐
│  Simulator (tab)     │─POST─▶  /api/simulate/incoming                 │
└──────────────────────┘      │        │                               │
                              │        ▼                               │
┌──────────────────────┐      │  Payment pipeline (B)                  │
│  Wise App (A)        │◀─SSE─┤   1. save transaction                  │
│  Home / Txns / Jars  │      │   2. classifier.classify() (C)         │
│  Tax Jar / Onboarding│─REST─▶   3. score ≥ 0.8 → reserve             │
└──────────────────────┘      │      0.4–0.8 → ask user                │
                              │      < 0.4  → personal                 │
                              │   4. FX → move to Tax Jar              │
                              │   5. emit event                        │
                              │  SQLite                                │
                              └────────────────────────────────────────┘
```

### Repository structure
```
wise-tax-jar/
├── frontend/            # A
├── backend/
│   ├── app/
│   │   ├── main.py          # B: FastAPI, routes
│   │   ├── models.py        # B: SQLModel
│   │   ├── pipeline.py      # B: incoming payment processing
│   │   ├── fx.py            # B
│   │   ├── events.py        # B: SSE
│   │   └── engine/          # C
│   │       ├── classifier.py
│   │       ├── tax_rules.py
│   │       └── countries.json
│   └── tests/               # C + B
├── demo/                # D: seed.json, scenarios, simulator
└── docs/                # D: ai-usage.md, pitch.md, qa.md
```

### Data models
```ts
TaxProfile      { country, regime, rate, taxCurrency, enabled }
Balance         { currency, amount }
Jar             { id, name, currency, balance, type: "tax" | "regular" }
Counterparty    { name, kind: "company" | "person" | "unknown", isKnownClient }
Transaction     { id, direction: "in" | "out", amount, currency, counterparty,
                  reference, createdAt,
                  classification: { label: "income" | "personal" | "unknown",
                                    confidence, reasons: string[] },
                  reservationId? }
TaxReservation  { id, transactionId, sourceAmount, sourceCurrency, rate,
                  fxRate, reservedAmount, taxCurrency,
                  status: "reserved" | "undone" | "paid" }
```

### API contract (freeze at T+1h)
| Method | Path | What it does |
|---|---|---|
| GET | `/api/account` | Balances and Jars |
| GET | `/api/transactions` | Transaction list with classification |
| GET / PUT | `/api/tax-profile` | Tax profile |
| GET | `/api/tax/countries` | Available countries, regimes and default rates |
| POST | `/api/simulate/incoming` | `{ senderName, senderKind?, amount, currency, reference }` |
| POST | `/api/transactions/{id}/answer` | `{ isIncome: bool }`, the answer to the bottom sheet |
| POST | `/api/transactions/{id}/undo` | Undo the reservation |
| GET | `/api/tax/summary` | Total set aside, by month, estimated amount due, next deadline |
| POST | `/api/tax/pay` | Create a pre-filled transfer from the Tax Jar |
| GET | `/api/tax/export.csv` | Export for an accountant |
| POST | `/api/demo/reset` | Reset to seed data |
| GET | `/api/events` | SSE: `transaction.created`, `reservation.created`, `question.asked`, `reservation.undone` |

Errors use a single format, `{ error: { code, message } }`. Amounts are stored in minor units (cents).

---

## 5. Classifier spec (role C)

The classifier is score-based with reasons, not ML: it's deterministic, explainable and doesn't depend on the network.

| Signal | Weight | Example |
|---|---|---|
| Payer marked by the user as a client | → straight to `income`, 0.99 | Earlier "Yes" answer |
| Payer marked as personal | → straight to `personal`, 0.99 | Earlier "No" answer |
| Legal entity in the name | +0.45 | `OÜ`, `AS`, `Ltd`, `LLC`, `Inc`, `GmbH`, `SIA`, `UAB`, `Sp. z o.o.` |
| Reference looks like an invoice | +0.35 | `invoice`, `INV-`, `arve`, `rechnung`, `faktura`, `#\d+` |
| Work-related words | +0.15 | `website`, `design`, `consulting`, `project`, `services` |
| Everyday / bill-split words | −0.40 | `pizza`, `dinner`, `beer`, `rent share`, `split`, `birthday`, food emoji |
| Private person and amount < 50 | −0.25 | |
| Transfer to self / between own accounts | → `personal` | Matches the account owner's name |

**Thresholds:** `≥ 0.8` → automatic reservation and toast; `0.4–0.8` → bottom sheet with a question; `< 0.4` → personal, no questions.
**Learning:** the user's answer is saved per payer, so the next payment from them is handled automatically.
**Explainability:** every decision returns `reasons[]`, and the UI shows them as a line like "Why: company sender · invoice in reference".

### Tax configs (`countries.json`)
| Country | Regime | Default rate | Status |
|---|---|---|---|
| EE | Entrepreneur account (ettevõtluskonto) | 20% | ✅ verified (2026 rate) |
| EE | FIE / self-employed | Income tax 22% + social tax; by default the user sets the reserve | ⚠️ D to refine the hint |
| * | Custom | User enters the % | — |
| 1–2 extra countries | — | — | ⚠️ D verifies against official sources, or we leave them out |

Disclaimer everywhere: **"An estimate for setting money aside, not tax advice."**

---

## 6. Plan by phase

Legend: **🤖 Prompt for Claude** = what to ask Claude at this step (in this chat or in each person's own session).

### Phase 0: Kickoff and contract · T+0 → T+1h · everyone together
- [ ] Fill in names in the roles table, create the repo and the team chat.
- [ ] Walk through the golden path and agree on what "done" means.
- [ ] **Freeze the API contract and models (section 4).**
- [ ] Everyone gets their part running as "hello world".

> 🤖 **Prompt (tech lead):** "Generate a scaffold for the wise-tax-jar monorepo: FastAPI backend with models and empty routes per the contract in the roadmap, Vite + React + TS frontend with Neptune wired up, a script to generate TS types from OpenAPI, and a README with run commands."

**✅ Checkpoint 0:** `backend` and `frontend` run for everyone, and the contract is in `main`.

---

### Phase 1: Foundation · T+1 → T+5h · in parallel

**A: Frontend**
- [ ] Mobile-width wrapper, bottom navigation, Wise-style header.
- [ ] Home: balance cards (EUR, USD, GBP), Jars section.
- [ ] Transaction list (icon, name, amount, "Tax set aside" / "Personal" tag).
- [ ] Transaction detail.
- [ ] Runs on mocks generated from OpenAPI.
> 🤖 "Here's a screenshot / description of the Wise home screen. Build it with `@transferwise/components` using this data. Neptune components only, no custom CSS where avoidable."

**B: Backend**
- [ ] SQLModel models, migration on startup, loading `demo/seed.json`.
- [ ] `GET /account`, `GET /transactions`, `GET/PUT /tax-profile`, `GET /tax/countries`.
- [ ] SSE endpoint `/api/events` with an in-memory event bus.
- [ ] `fx.py` with fixed rates and conversion in minor units.
> 🤖 "Implement endpoints X, Y, Z per this contract and these models. Amounts in cents, single error format, SSE via StreamingResponse."

**C: Tax Engine**
- [ ] `classifier.py`: signals, weights, thresholds, `reasons[]`.
- [ ] `tax_rules.py` + `countries.json`: reservation amount calculation.
- [ ] Storage for "payer → client / personal".
- [ ] **Tests for 15–20 cases**, including every demo case and the edge cases.
> 🤖 "Write the classifier per the spec in section 5 and pytest tests for these cases: [list]. Show which cases land in the question zone."

**D: Product & Demo**
- [ ] `demo/seed.json`: owner, 3 balances, ~15 historical transactions, 2 regular Jars.
- [ ] `demo/scenarios.json`: demo payments (Acme, Mari, John) + 5 spares.
- [ ] Verify EE rates (FIE) and decide whether extra countries are needed.
- [ ] UI copy: onboarding, toast, bottom sheet, empty states, disclaimer.
- [ ] Create `docs/ai-usage.md`.
> 🤖 "Generate a realistic seed.json for an Estonian freelancer: names, references, amounts in different currencies, all synthetic." · "Write UX copy for these screens in Wise's tone: short, direct, no jargon."

**✅ Checkpoint 1 (T+5h):** the frontend talks to the real backend, the classifier passes its tests, the seed loads.

---

### Phase 2: Core feature · T+5 → T+10h

**A: Frontend**
- [ ] Onboarding: country → regime → rate → tax currency (3–4 screens).
- [ ] SSE subscription: new transactions appear without a reload.
- [ ] Toast "€X set aside for taxes" + "Why" line + "Undo" button.
- [ ] Bottom sheet "Is this payment for work?" (Yes / No).
- [ ] Tax Jar in the Jars list with its own icon.

**B: Backend**
- [ ] `pipeline.py`: save → classify → reserve / ask / personal → FX → move to Tax Jar → emit event.
- [ ] `POST /simulate/incoming`, `POST /transactions/{id}/answer`, `POST /transactions/{id}/undo`.
- [ ] Idempotent, transactional balance → Jar move (no negative balances, no double moves).

**C: Tax Engine**
- [ ] Integrate the classifier into the pipeline together with B.
- [ ] Learning from answers: `answer` updates the payer's status.
- [ ] Human-readable `reasons` texts (EN, optionally RU/ET).
- [ ] Review B's pipeline code (money must never go missing).

**D: Product & Demo**
- [ ] **Simulator:** a separate page with scenario buttons + a custom payment form + "Reset demo".
- [ ] First golden path run, bug list in the chat.
- [ ] Pitch skeleton in `docs/pitch.md`.
> 🤖 "Build a simple simulator page: buttons from scenarios.json call POST /api/simulate/incoming, plus a form and a reset button."

**✅ Checkpoint 2 (T+10h): golden path steps 1–4 work end to end.** If not, everyone drops everything else and fixes it.

---

### Phase 3: Value and depth · T+10 → T+15h

**A:** Tax Jar screen: total, monthly chart (Neptune / simple bar chart), next deadline, reservation history, "Pay tax" button → transfer confirmation screen; CSV export.
**B:** `GET /tax/summary`, `POST /tax/pay`, `GET /tax/export.csv`, `POST /demo/reset`; error handling and edge cases (outgoing payments, refunds, non-EUR currency).
**C:** "amount due" and deadline calculation per regime; tests for summary and FX; check that the Tax Jar total = sum of active reservations.
**D:** pitch v1 (4–6 slides max; the live demo is the main thing), Q&A prep in `docs/qa.md`, timed run #1.

> 🤖 "Here's our demo script and the rubric. Find the weak spots the judges will notice." · "Write 10 tough questions Wise judges might ask, with short answers."

**✅ Checkpoint 3 (T+15h):** the full golden path, including Tax Jar and payment.

> 😴 Sleep in shifts: at least 2 people sleep while 2 polish.

---

### Phase 4: Polish and reliability · T+15 → T+20h
- [ ] **A:** animations for the toast and new transactions, empty states, loading states, small mismatches with Wise's look.
- [ ] **B + C:** run all tests, remove hardcoding, make sure the demo works without internet.
- [ ] **D:** QA against the checklist, 3 full runs, **record a backup demo video** in case everything breaks.
- [ ] **Feature freeze at T+20h.** Bug fixes only after that.

> 🤖 "Review this diff for errors in money logic and race conditions." · "Here's the error/stack trace, help me find the cause."

---

### Phase 5: Pitch · T+20 → T+24h · everyone
- [ ] Final script: who says what, who clicks.
- [ ] 3 timed runs, Q&A practice (D asks the questions).
- [ ] Finalise `docs/ai-usage.md` for the AI disclosure.
- [ ] Demo laptop: charged, `demo/reset` before going on stage, tabs open, notifications off.

---

## 7. Priorities (what to cut if we run out of time)

| Priority | Features |
|---|---|
| **Must** | Wise look (Home, transactions), onboarding, classifier, automatic reservation into Tax Jar + toast with "why", question bottom sheet, simulator |
| **Should** | Tax Jar screen with stats, undo, FX from USD, learning from answers, reset |
| **Could** | Tax payment, CSV export, deadlines, a second country, LLM-written "why" texts |
| **Won't** | Real integration with tax authorities, real Wise API, authentication, native mobile app |

---

## 8. Pitch structure (~4 min)

1. **Problem (30 sec).** "A freelancer receives $1,500. How much of it is actually theirs? At the end of the year, a surprise worth thousands of euros." A concrete persona.
2. **Insight (20 sec).** Estonia has already proven the model (entrepreneur account, 20% set aside automatically), but it's one bank, one currency, one country.
3. **Live demo (2.5 min).** Golden path, steps 1–5. Talk less, show more.
4. **Why Wise (30 sec).** Multi-currency, Jars already exist, and Wise customers include international freelancers. This is a continuation of the product, not a new product.
5. **What's next (10 sec).** More countries, integration with tax authorities, moving subscriptions over from your old bank.

### Q&A prep
| Question | Answer |
|---|---|
| Is this tax advice? | No, it's a reserve with a safety margin. The rate is visible and adjustable, there's a disclaimer, and the user files their own taxes. |
| What if the classifier gets it wrong? | One-tap undo; unclear cases are asked, and the answer is remembered. Every decision is explained. |
| Why rules and not ML? | Explainable, deterministic, works offline, easy to audit. ML can be layered on top once there's labelled data. |
| Why not pay the tax automatically? | That needs integration with tax authorities and regulatory work. Reserve + one tap delivers 90% of the value without those risks. |
| How does this scale to other countries? | Tax rules live in config: a new country is a config entry, not code. |
| Privacy? | We only analyse transactions that are already in Wise; no external data. |

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Neptune doesn't play well with our React version / build | A checks in the first hour; fallback: `neptune-css` + tokens without the components |
| Frontend–backend integration at the last minute | Contract at T+1h, mocks from OpenAPI, checkpoints |
| Money "goes missing" between balance and Jar | Invariant test from C: balance + Jars = sum of all operations |
| Wi-Fi / API goes down | Nothing external on the critical path, backup video |
| Scope creep | Priorities from section 7, feature freeze at T+20h |

---

## 10. Context for Claude (paste at the start of every new session)

```
We're at a Wise hackathon, theme "Max Ease". We're building a prototype,
"Wise Tax Jar": a web app in Wise's visual style (Neptune,
@transferwise/components) that classifies incoming payments (work income vs
personal transfers) and automatically sets aside a percentage for taxes in a
separate Jar, in the tax currency.
Stack: React+TS+Vite, FastAPI+SQLModel+SQLite, SSE. Amounts in cents.
Rule-based classifier with scoring and reasons[], thresholds 0.8 / 0.4.
All data is synthetic. My role: [A/B/C/D]. Current task: [...]
```
