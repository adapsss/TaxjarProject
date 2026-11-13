# Wise Tax Jar — Role B: Backend & API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Storage, the REST and SSE API, and all money movement: the payment pipeline, reservations, undo and tax payment.

**Shared plan:** `docs/superpowers/plans/2026-11-13-wise-tax-jar.md`. Its Global Constraints, Decisions and Review Focus apply to every task here. Task S0 in that file must be in `main` before you start.

**Spec:** `roadmap-tax-jar-en.md` (repo root).

**Branch prefix:** `be/*`. Merge into `main` after every task.

**You own (nobody else edits these):** `backend/app/main.py`, `models.py`, `db.py`, `fx.py`, `events.py`, `pipeline.py`, `reservations.py`, `routes/core.py`, `routes/payments.py`, `backend/tests/conftest.py` and your own test files.

**What you wait for:**

| Your task | Needs | Until then |
|---|---|---|
| B1 | S0 only | Start here while D1 lands. |
| B2 | D1 (`demo/seed.json`), C2 (`tax_rules`) | Do B1 and B3's bus tests first. |
| B4 | C1 (`classifier`), C2 | Both are small and start at the same time as you; if they are late, code against their Interfaces blocks in the role C file. |
| B5, B6 | C3 Step 1 (`assert_invariants`) | Leave the `assert_invariants` line out and add it when the helper is merged. |

**Review Focus items that land in your tasks:** 1 (B4, B5), 2 (B4), 3 (B4), 4 (B6), 5 (B2, B4).

Tasks are in the order to do them. Cut from the bottom: Could first, then Should.

---

### Task B1 · Must: FX

**Files:**
- Create: `backend/app/fx.py`
- Test: `backend/tests/test_fx.py`

**Interfaces — Produces:**

```python
TO_EUR_BP = {"EUR": 10000, "USD": 9200, "GBP": 11500}
def is_supported(currency: str) -> bool
def rate(src: str, dst: str) -> float                    # for display; rate("USD","EUR") == 0.92
def convert(amount: int, src: str, dst: str) -> int      # via EUR, round half up; raises UnsupportedCurrency
class UnsupportedCurrency(ValueError)
```

- [ ] **Step 1: Write the failing tests.**

```python
def test_usd_to_eur():        # convert(30000, "USD", "EUR") == 27600
def test_gbp_to_eur():        # convert(18000, "GBP", "EUR") == 20700
def test_same_currency():     # convert(8000, "EUR", "EUR") == 8000
def test_cross_via_eur():     # convert(10000, "USD", "GBP") == 8000
def test_unsupported():       # convert(100, "JPY", "EUR") raises UnsupportedCurrency
def test_display_rate():      # rate("USD", "EUR") == 0.92
```

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement with integer maths. Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(be): fixed-rate FX in minor units`.

### Task B2 · Must: Storage, seed, read endpoints, tax profile, error format

**Files:**
- Create: `backend/app/models.py`, `backend/app/db.py`
- Modify: `backend/app/routes/core.py` (replace the stubs for the routes below), `backend/app/main.py` (error handlers, startup), `backend/tests/conftest.py` (replace the Task S0 fixture)
- Test: `backend/tests/test_read_api.py`

**Interfaces:**
- Consumes: `tax_rules.load_countries`, `tax_rules.get_regime`, `fx.is_supported`.
- Produces (tables in `models.py`):

```python
ProfileRow(id=1, owner_name, country, regime, rate_bp, tax_currency, enabled)
BalanceRow(currency PK, amount)
JarRow(id PK, name, currency, balance, type)                        # the Tax Jar has id "tax"
CounterpartyRow(key PK, name, kind, status)                          # key = normalize_name(name); status "client" | "personal" | None
TransactionRow(id PK uuid4 str, direction, amount, currency, counterparty_key, reference,
               created_at, label, confidence, reasons_json, reservation_id)
ReservationRow(id PK uuid4 str, transaction_id UNIQUE, source_amount, source_currency, rate_bp,
               fx_rate, reserved_amount, tax_currency, status, created_at)
```

```python
# db.py
def get_session() -> Iterator[Session]            # FastAPI dependency
def reset_to_seed(session: Session) -> None       # delete every row, reload demo/seed.json
def to_transaction(session, row: TransactionRow) -> schemas.Transaction
def to_account(session) -> schemas.Account
# conftest.py fixtures: `session` (in-memory SQLite with StaticPool and connect_args={"check_same_thread": False}, seeded), `client` (TestClient using it),
# `onboarded` (profile set to EE / entrepreneur_account / 2000 / EUR / enabled)
```

`demo/seed.json` comes from Task D1, which lands in the first hour. Its values are fixed there; these tests rely on them.

The database file is `backend/data/app.db` (gitignored). On startup, create tables and seed if `ProfileRow` is missing.

- [ ] **Step 1: Write the failing tests.**

```python
def test_account_matches_seed(client):       # owner "Kadri Saar"; 3 balances; jar with id "tax" has balance 0
def test_transactions_newest_first(client):  # createdAt is non-increasing; each has classification.label
def test_countries(client):                  # EE has regimes entrepreneur_account and fie
def test_put_profile_enables(client):        # PUT {country:"EE",regime:"entrepreneur_account",rate:2000,
                                             #      taxCurrency:"EUR",enabled:true} → 200; GET returns the same
def test_rate_out_of_range(client):          # rate 10001 and rate -1 → 422, body["error"]["code"] == "validation_error"
def test_unknown_regime(client):             # regime "nope" → 422, code "unknown_regime"
def test_unsupported_tax_currency(client):   # taxCurrency "JPY" → 422, code "unsupported_currency"
def test_tax_currency_locked_when_jar_has_money(client, session):
    # set the tax jar balance to 100, PUT taxCurrency "USD" → 409, code "tax_jar_not_empty"
def test_tax_currency_change_moves_empty_jar(client):  # jar empty, PUT taxCurrency "USD" → jar currency "USD"
def test_unknown_route_uses_error_format(client):      # GET /api/nope → 404, "error" in body
def test_reset_restores_seed(client):        # change the profile, POST /api/demo/reset → profile enabled is False
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Register handlers for `RequestValidationError` (422, `validation_error`), `HTTPException` and a small `ApiError(status, code, message)` so every error leaves in the single format. `POST /demo/reset` calls `reset_to_seed` (the `demo.reset` event is added in Task B3).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(be): storage, seed, read endpoints and tax profile`.

### Task B3 · Must: Event bus and SSE

**Files:**
- Create: `backend/app/events.py`
- Modify: `backend/app/routes/core.py` (`GET /api/events`, publish `demo.reset`)
- Test: `backend/tests/test_events.py`

**Interfaces — Produces:**

```python
class EventBus:
    def subscribe(self) -> asyncio.Queue
    def unsubscribe(self, q: asyncio.Queue) -> None
    def publish(self, type: str, data: dict) -> None      # put_nowait to every subscriber; never blocks or raises
def format_sse(type: str, data: dict) -> str               # "event: <type>\ndata: <json>\n\n"
def get_bus() -> EventBus                                   # FastAPI dependency, one bus per app
# conftest.py gains fixture `events`: a list that records (type, data) for every publish in the test
```

- [ ] **Step 1: Write the failing tests.**

```python
def test_publish_reaches_every_subscriber():   # two queues both receive ("transaction.created", {...})
def test_unsubscribed_queue_gets_nothing():
def test_publish_with_no_subscribers_is_fine():
def test_format_sse():   # format_sse("demo.reset", {}) == "event: demo.reset\ndata: {}\n\n"
def test_reset_publishes_demo_reset(client, events):   # POST /api/demo/reset → events[-1][0] == "demo.reset"
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** The endpoint returns a `StreamingResponse` with media type `text/event-stream`, sends a `: ping` comment every 15 seconds (use `asyncio.wait_for` on the queue; `asyncio.timeout` needs 3.11), and unsubscribes when the client disconnects.
- [ ] **Step 4: Run, expect PASS.** Then check by hand: `curl -N localhost:8000/api/events` in one terminal, `curl -X POST localhost:8000/api/demo/reset` in another, and the first prints the `demo.reset` frame.
- [ ] **Step 5: Commit** `feat(be): event bus and SSE endpoint`.

### Task B4 · Must: Payment pipeline, simulate and answer

**Files:**
- Create: `backend/app/pipeline.py`, `backend/app/reservations.py`
- Modify: `backend/app/routes/payments.py` (`POST /simulate/incoming`, `POST /transactions/{id}/answer`)
- Test: `backend/tests/test_pipeline.py`

**Interfaces:**
- Consumes: `classifier.classify`, `classifier.normalize_name`, `classifier.infer_kind`, `tax_rules.compute_tax`, `fx.convert`, `fx.rate`, `EventBus.publish`, the tables from Task B2.
- Produces:

```python
# reservations.py
def reserve(session, tx: TransactionRow, profile: ProfileRow) -> ReservationRow | None
# pipeline.py
def process_incoming(session, bus, *, sender_name: str, sender_kind: str | None, amount: int,
                     currency: str, reference: str) -> TransactionRow
def answer(session, bus, tx_id: str, is_income: bool) -> TransactionRow
```

Behaviour:
- `reserve`: `source = min(compute_tax(tx.amount, profile.rate_bp), balance of tx.currency)`. If `source == 0` return `None`. If a reservation already exists for the transaction, return it unchanged. Otherwise subtract `source` from the balance, add `convert(source, tx.currency, profile.tax_currency)` to the jar `tax`, and insert the row with `fx_rate = fx.rate(...)` and status `reserved`.
- `process_incoming`: reject bad input first (see tests). Credit the balance (create the row if the currency is supported but absent), upsert the counterparty by normalised name, classify, save. If the profile is enabled and the label is `income`, call `reserve`. Commit once, then publish in this order: `transaction.created`; then `reservation.created` if a reservation was made; or `question.asked` if the profile is enabled and the label is `unknown`.
- `answer`: if the profile is disabled, raise 409 `tax_profile_disabled`. If the transaction's label is not `unknown`, return it unchanged and publish nothing. `True` → label `income`, confidence 0.99, reasons `["you confirmed this was for work"]`, counterparty status `client`, `reserve` and, when it returns a reservation, publish `reservation.created`. `False` → label `personal`, confidence 0.99, reasons `["you said this wasn't for work"]`, counterparty status `personal`.

- [ ] **Step 1: Write the failing pipeline tests** (assert deltas, not seed values).

```python
def test_acme_reserves_276_eur(client, onboarded, events):
    # POST {senderName:"Acme Inc.", amount:150000, currency:"USD", reference:"INV-042"} → 200
    # label "income"; reasons ["company sender","invoice in reference"]
    # reservation: sourceAmount 30000, sourceCurrency "USD", rate 2000, fxRate 0.92,
    #              reservedAmount 27600, taxCurrency "EUR", status "reserved"
    # USD balance delta == +120000; tax jar delta == +27600
    # event types == ["transaction.created", "reservation.created"]
def test_mari_is_personal(client, onboarded, events):
    # {senderName:"Mari Tamm", senderKind:"person", amount:2300, currency:"EUR", reference:"pizza 🍕"}
    # label "personal"; reservation is None; EUR delta +2300; tax jar delta 0; events ["transaction.created"]
def test_john_is_asked(client, onboarded, events):
    # {senderName:"John Smith", amount:40000, currency:"EUR", reference:"website"}
    # label "unknown"; reservation None; events ["transaction.created","question.asked"]
def test_answer_yes_reserves_and_remembers(client, onboarded, events):
    # after John: POST answer {isIncome:true} → label "income"; reservedAmount 8000; EUR delta +32000 overall
    # GET /api/transactions shows counterparty.isKnownClient True
    # next payment John Smith 10000 EUR "logo" → label "income", reasons ["you marked this payer as a client"],
    #   reservedAmount 2000, and no "question.asked" event
def test_answer_no_remembers_personal(client, onboarded, events):
    # after John: answer {isIncome:false} → label "personal", no reservation
    # next John payment 40000 "website" → label "personal", no question
def test_answer_twice_moves_money_once(client, onboarded):     # Review Focus 1: second answer → 200, tax jar unchanged
def test_answer_unknown_id(client, onboarded):      # 404, code "transaction_not_found"
def test_answer_before_onboarding(client):          # John while disabled, answer → 409, code "tax_profile_disabled";
                                                    # after onboarding the same answer {isIncome:true} reserves 8000
def test_payment_before_onboarding(client, events): # Review Focus 2, profile still disabled: Acme → balance credited,
                                                    # reservation None, events ["transaction.created"]
def test_zero_rate_reserves_nothing(client, onboarded, events):  # Review Focus 5: rate 0, Acme → reservation None,
                                                      # events ["transaction.created"]
@pytest.mark.parametrize("body, code", [            # Review Focus 3
    ({"senderName":"Acme Inc.","amount":100,"currency":"JPY","reference":""}, "unsupported_currency"),
    ({"senderName":"Acme Inc.","amount":0,"currency":"EUR","reference":""},   "validation_error"),
    ({"senderName":"Acme Inc.","amount":-5,"currency":"EUR","reference":""},  "validation_error"),
    ({"senderName":"   ","amount":100,"currency":"EUR","reference":""},       "validation_error"),
])
def test_bad_simulate_input(client, onboarded, body, code):    # 422, that code, and the transaction count is unchanged
```

- [ ] **Step 2: Run the file, expect FAIL.**
- [ ] **Step 3: Implement** `reservations.reserve`, `pipeline.py` and the two routes.
- [ ] **Step 4: Run the whole backend suite.** Expected: all pass.
- [ ] **Step 5: Commit** `feat(be): payment pipeline with classification, reservation and learning`, then ask role C to review it (their Task C3).

### Task B5 · Should: Undo

**Files:**
- Modify: `backend/app/reservations.py`, `backend/app/routes/payments.py`
- Test: `backend/tests/test_undo.py`

**Interfaces — Produces:** `reservations.undo(session, bus, tx_id: str) -> TransactionRow`

Behaviour: status `reserved` → return `source_amount` to the source-currency balance, subtract `reserved_amount` from the Tax Jar, set status `undone`, set the transaction to label `personal` with reasons `["you said this wasn't income"]`, publish `reservation.undone`. The payer's remembered status does not change. Status `undone` → return the transaction unchanged, publish nothing.

- [ ] **Step 1: Write the failing tests.**

```python
def test_undo_returns_money(client, session, onboarded, events):
    # Acme, then POST undo → reservation.status "undone"; label "personal"
    # USD delta back to +150000; tax jar delta 0; last event "reservation.undone"; assert_invariants
def test_undo_twice_moves_money_once(client, onboarded):     # Review Focus 1
def test_undo_without_reservation(client, onboarded):        # Mari → 409, code "no_reservation"
def test_undo_unknown_id(client):                            # 404, code "transaction_not_found"
def test_undo_does_not_forget_client(client, onboarded):     # John yes, undo, next John payment is still "income"
```

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run the whole suite, expect PASS.**
- [ ] **Step 5: Commit** `feat(be): undo a tax reservation`.

### Task B6 · Could: Pay tax

**Files:**
- Modify: `backend/app/reservations.py`, `backend/app/routes/payments.py`
- Test: `backend/tests/test_pay.py`

**Interfaces — Produces:** `reservations.pay_all(session, bus) -> tuple[TransactionRow, int]` (the outgoing transaction and the amount paid)

`pay_all`: sum the `reserved` reservations, set them to `paid`, set the Tax Jar to 0, and save an outgoing transaction to `Tax authority (demo)` with reference `Tax payment`, label `personal`, in the tax currency; publish `transaction.created`. `undo` on a `paid` reservation raises 409 `reservation_paid`.

- [ ] **Step 1: Write the failing tests.**

```python
def test_pay_empties_the_jar(client, session, onboarded):
    # Acme, POST /api/tax/pay → paidAmount 27600; currency "EUR"; transaction.direction "out"
    # tax jar balance 0; USD balance unchanged by the payment; assert_invariants(session)
def test_pay_with_empty_jar(client, onboarded):       # 409, code "nothing_to_pay"
def test_undo_after_paid(client, onboarded):          # Review Focus 4: 409, code "reservation_paid"; jar still 0
```

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run the whole suite, expect PASS.**
- [ ] **Step 5: Commit** `feat(be): pay tax from the Tax Jar`.
