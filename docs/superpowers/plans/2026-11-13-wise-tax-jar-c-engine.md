# Wise Tax Jar — Role C: Tax Engine & Classifier

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The income-or-personal classifier, tax rules and country config, the money invariant tests, the tax summary and the CSV export.

**Shared plan:** `docs/superpowers/plans/2026-11-13-wise-tax-jar.md`. Its Global Constraints, Decisions and Review Focus apply to every task here. Task S0 in that file must be in `main` before you start.

**Spec:** `roadmap-tax-jar-en.md` (repo root).

**Branch prefix:** `engine/*`. Merge into `main` after every task.

**You own (nobody else edits these):** `backend/app/engine/`, `backend/app/summary.py`, `backend/app/routes/reports.py`, `backend/tests/invariants.py` and your own test files.

**What you wait for:**

| Your task | Needs | Until then |
|---|---|---|
| C1, C2 | S0 only | Start immediately; role B needs both for B4. |
| C3 Step 1 | B2 | Do C1 and C2 first. |
| C3 Steps 3–5 | B4 | Start C4 against the tables from B2. |
| C4 | B2 for the tables, B4 to create reservations in tests; `test_undone_is_excluded` needs B5 | Mark that one test `xfail` until B5 is merged. |
| C5 | B4 | — |

**Review Focus items that land in your tasks:** none directly; C3 is the safety net for 1, 4 and 5.

Tasks are in the order to do them. Cut from the bottom: Could first, then Should.

---

### Task C1 · Must: Classifier

**Files:**
- Create: `backend/app/engine/__init__.py`, `backend/app/engine/classifier.py`
- Test: `backend/tests/test_classifier.py`

**Interfaces — Produces:**

```python
BASELINE = 30; RESERVE_AT = 80; ASK_AT = 40
W_COMPANY = 45; W_INVOICE = 35; W_WORK = 15; W_EVERYDAY = -40; W_SMALL_PERSON = -25
SMALL_AMOUNT_MINOR = 5000        # "amount < 50", in the payment's own currency

@dataclass(frozen=True)
class Result: label: str; score: int; confidence: float; reasons: list[str]

def normalize_name(name: str) -> str          # casefold, trim, collapse inner whitespace
def infer_kind(sender_name: str, sender_kind: str | None) -> str   # "company" | "person" | "unknown"
def classify(*, sender_name: str, sender_kind: str | None, amount: int, reference: str,
             owner_name: str, payer_status: str | None) -> Result   # payer_status: "client" | "personal" | None
```

Rules, in this order:
1. `normalize_name(sender_name) == normalize_name(owner_name)` → `personal`, score 0, confidence 0.99, reason `transfer between your own accounts`.
2. `payer_status == "client"` → `income`, score 100, confidence 0.99, reason `you marked this payer as a client`. `"personal"` → `personal`, score 0, confidence 0.99, reason `you marked this payer as personal`.
3. Otherwise start at `BASELINE` and add each signal at most once:
   - Company: `sender_kind == "company"`, or the name contains a legal-entity token as a whole word. `OÜ`, `AS`, `SIA`, `UAB` match case-sensitively; `Ltd`, `LLC`, `Inc`, `GmbH`, `Sp. z o.o.` match case-insensitively, with an optional trailing dot. Reason `company sender`.
   - Invoice: reference matches, case-insensitively, `invoice`, `inv-`, `arve`, `rechnung`, `faktura` or `#\d+`. Reason `invoice in reference`.
   - Work words: the reference contains `website`, `design`, `consulting`, `project`, `services`. Reason `work-related reference`.
   - Everyday: the reference contains `pizza`, `dinner`, `beer`, `rent share`, `split`, `birthday`, or any of 🍕🍔🍺🍻🍷🍣🎂. Reason `everyday reference`.
   - Small private payment: `infer_kind(...)` is not `company` (so a company recognised by its name is exempt) and `amount < SMALL_AMOUNT_MINOR`. Reason `small amount from a private person`.
4. Clamp the score to 0–100. `score >= 80` → `income`; `40 <= score < 80` → `unknown`; below 40 → `personal`. Confidence is `score / 100` for `income` and `unknown`, and `1 - score / 100` for `personal`.

- [ ] **Step 1: Write the failing tests** as one parametrised table plus the named cases.

```python
CASES = [  # sender, kind, amount, reference, payer_status, label, score
    ("Acme Inc.",        None,     150000, "INV-042",            None,       "income",   100),
    ("Mari Tamm",        "person",   2300, "pizza 🍕",           None,       "personal",   0),
    ("John Smith",       None,      40000, "website",            None,       "unknown",   45),
    ("Kaselaane Puit AS", None,      10000, "",                   None,       "unknown",   75),
    ("Astrid Laanemets", None,      10000, "",                   None,       "personal",  30),
    ("Sia Kask",         None,      10000, "",                   None,       "personal",  30),
    ("Peeter Paju",      "person",  30000, "invoice website",    None,       "income",    80),
    ("Peeter Paju",      "person",   2000, "INV-7",              None,       "unknown",   40),
    ("Peeter Paju",      "person",   2000, "website",            None,       "personal",  20),
    ("Nordwind GmbH",    None,     220000, "Rechnung 2026-118",  None,       "income",   100),
    ("Brightside ltd.",  None,      90000, "consulting March",   None,       "income",    90),
    ("Brightside ltd.",  None,       3000, "consulting",         None,       "income",    90),
    ("Pizza Kiosk OÜ",   None,      10000, "pizza",              None,       "personal",  35),
    ("Liis Kask",        "person",  10000, "order #123",         None,       "unknown",   65),
    ("Liis Kask",        "person",   6000, "dinner split",       None,       "personal",   0),
    ("Liis Kask",        "person",  10000, "website design project", None,   "unknown",   45),
    ("John Smith",       None,       1000, "pizza",              "client",   "income",   100),
    ("Acme Inc.",        None,     150000, "INV-042",            "personal", "personal",   0),
    ("  kadri   SAAR ",  None,      20000, "invoice",            None,       "personal",   0),
]  # owner_name is "Kadri Saar" in every case

def test_acme_reasons():   # reasons == ["company sender", "invoice in reference"]
def test_learned_confidence():   # payer_status "client" → confidence == 0.99
def test_personal_confidence_is_inverted():   # Mari → confidence == 1.0
```

- [ ] **Step 2: Run `pytest tests/test_classifier.py -q`.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement `classifier.py`** per the rules above. Pure functions, standard library only.
- [ ] **Step 4: Run the tests.** Expected: all pass.
- [ ] **Step 5: Commit** `feat(engine): rule-based payment classifier with reasons`.

### Task C2 · Must: Tax rules and country config

**Files:**
- Create: `backend/app/engine/tax_rules.py`, `backend/app/engine/countries.json`
- Test: `backend/tests/test_tax_rules.py`

**Interfaces — Produces:**

```python
def load_countries() -> list[dict]                       # shape of schemas.Country, plus "deadline" per regime
def get_regime(country: str, regime: str) -> dict | None
def compute_tax(amount: int, rate_bp: int) -> int        # round half up, integer maths only
def next_deadline(country: str, regime: str, today: date) -> date | None
```

`countries.json` content:

| country | regime id | name | defaultRate | hint | deadline |
|---|---|---|---|---|---|
| `EE` Estonia | `entrepreneur_account` | Entrepreneur account (ettevõtluskonto) | 2000 | `20% of every payment received is set aside.` | `{"type":"monthly","day":10}` |
| `EE` | `fie` | FIE / self-employed | 2200 | `Income tax is 22%. Social tax comes on top, so set the rate you want to reserve.` | `{"type":"quarterly","day":15,"months":[3,6,9,12]}` |
| `*` Other | `custom` | Custom | 2000 | `Enter the percentage you want to set aside.` | `null` |

- [ ] **Step 1: Write the failing tests.**

```python
def test_compute_tax():            # (150000, 2000) == 30000; (2333, 2000) == 467; (2332, 2000) == 466; (100, 0) == 0
def test_ee_entrepreneur_default():  # get_regime("EE","entrepreneur_account")["defaultRate"] == 2000
def test_unknown_regime():         # get_regime("EE","nope") is None
def test_monthly_deadline():       # ("EE","entrepreneur_account", date(2026,11,13)) == date(2026,12,10)
                                   # on date(2026,11,10) == date(2026,11,10)
def test_quarterly_deadline():     # ("EE","fie", date(2026,11,13)) == date(2026,12,15)
                                   # on date(2026,12,16) == date(2027,3,15)
def test_custom_has_no_deadline(): # ("*","custom", any) is None
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `tax_rules.py` and `countries.json`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): tax rules and country config`.

### Task C3 · Must: Money invariants and pipeline review

**Files:**
- Create: `backend/tests/invariants.py`, `backend/tests/test_money_invariants.py`

**Interfaces:**
- Consumes: the tables from Task B2 (for the helper); `POST /api/simulate/incoming` and `answer` from Task B4 (for the test).
- Produces: `assert_invariants(session) -> None` in `backend/tests/invariants.py`, imported by other roles' tests as `from invariants import assert_invariants`.

- [ ] **Step 1: Write the helper** as soon as Task B2 is merged, so roles B and D can import it.

```python
def assert_invariants(session):
    # tax jar balance == sum(reserved_amount) over reservations with status "reserved"
    # no balance and no jar is negative
    # for each currency: balance == seed.json balance + sum(amount of incoming transactions not in seed.json)
    #   - sum(source_amount of reservations with status "reserved" or "paid")
```

- [ ] **Step 2: Commit** `test(engine): money invariant helper`.
- [ ] **Step 3: When Task B4 is merged, write the test.**

```python
def test_invariants_after_mixed_payments(client, session, onboarded):
    # Acme, Mari, John, answer yes, Brightside Ltd 90000 GBP "consulting March" → assert_invariants(session)
```

- [ ] **Step 4: Run it.** Expected: PASS. A failure here is a money bug in the pipeline: report it to role B with the failing numbers, do not patch around it in the helper.
- [ ] **Step 5: Review role B's `pipeline.py` and `reservations.py`** against the Behaviour list in Task B4: every balance change has a matching jar change in the same commit, events are published only after the commit, and nothing writes to the Tax Jar outside `reservations.py`.
- [ ] **Step 6: Commit** `test(engine): pipeline money invariants`.

### Task C4 · Should: Tax summary

**Files:**
- Create: `backend/app/summary.py`
- Modify: `backend/app/routes/reports.py`
- Test: `backend/tests/test_summary.py`

**Interfaces:**
- Consumes: `tax_rules.next_deadline`.
- Produces: `summary.build_summary(session, today: date) -> schemas.TaxSummary`

`totalReserved` sums status `reserved`; `totalPaid` sums status `paid`; `byMonth` groups `reserved` and `paid` reservations by the month they were created, oldest first, leaving out `undone`; `estimatedDue == totalReserved`; `nextDeadline` comes from the profile's regime; `disclaimer` is the Global Constraints string.

- [ ] **Step 1: Write the failing tests.**

```python
def test_summary_after_acme_and_john(client, onboarded):
    # Acme + John answered yes → totalReserved 35600; taxCurrency "EUR"; estimatedDue 35600
    # byMonth == [{"month": <current YYYY-MM>, "reserved": 35600}]
def test_undone_is_excluded(client, onboarded):       # Acme then undo → totalReserved 0; byMonth == []
def test_empty_summary(client):                       # no reservations → totals 0, byMonth [], disclaimer present
def test_deadline_follows_regime(session, onboarded): # build_summary(session, date(2026,11,13)).next_deadline == date(2026,12,10)
```

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(be): tax summary`.

### Task C5 · Could: CSV export

**Files:**
- Modify: `backend/app/summary.py`, `backend/app/routes/reports.py`
- Test: `backend/tests/test_export.py`

**Interfaces — Produces:** `summary.export_rows(session) -> list[list[str]]` (header row first)

Columns: `date, payer, reference, source_amount, source_currency, tax_rate_percent, fx_rate, reserved_amount, tax_currency, status`. Amounts in major units with two decimals; `tax_rate_percent` without trailing zeros (2000 → `20`, 2250 → `22.5`); every reservation, including undone and paid ones, oldest first. Response headers: `text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="tax-jar.csv"`.

- [ ] **Step 1: Write the failing tests.**

```python
def test_csv_export(client, onboarded):
    # Acme → second line == "<date>,Acme Inc.,INV-042,300.00,USD,20,0.92,276.00,EUR,reserved"
    # content-type starts with "text/csv"
def test_csv_quotes_commas(client, onboarded):        # sender "Smith, Jones Ltd" stays one CSV field
def test_csv_header_only_when_empty(client):          # exactly one line
```

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement with the `csv` module. Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(engine): CSV export for an accountant`.
