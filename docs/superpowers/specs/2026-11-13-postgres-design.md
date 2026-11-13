# Postgres: all data in the database (design)

## Intent

The backend keeps its state in SQLite and its tax knowledge in JSON files shipped with the code. Before the demo moves to AWS, the team wants a production-grade setup: everything that can live in a database lives in Postgres, started locally by Docker Compose and later by a managed Postgres on AWS.

**Who uses it (decided by nisabu):** judges and the team running the demo. One shared account (Kadri Saar), the simulator and "Fresh start" stay. Production grade means the foundations: schema migrations, a real Postgres, health checks, secrets from the environment, no data loss on restart. It does not mean sign-in or multiple users.

## Goals

- All app state in Postgres: profile, balances, jars, payers, transactions, reservations.
- All tax information in Postgres, with nothing dropped: countries, regimes and every field they carry today, including brackets, social contributions, tax parts, deadlines, sources, notes, verification status and unverified fields; plus the 496 legal forms.
- The demo seed and the demo scenarios in Postgres.
- The app reads only from Postgres at runtime; no JSON file is opened by the running backend.
- `docker compose up --build` gives a working stack from an empty machine: Postgres, migrations and data load, backend, web.
- The 359 backend tests, 28 frontend unit tests and the golden path keep passing, with the backend tests running against Postgres.
- Ready for AWS: every setting from environment variables, migrations runnable as a one-off task, no local files the backend depends on.

## Non-goals

- The AWS deployment itself (next project, designed on top of this one).
- Sign-in, users, roles.
- An admin screen for editing tax data. Rows are edited with SQL; a UI is later.
- Changing what the API returns, apart from one new read endpoint for the demo scenarios.

## Anti-goals

- A tax rate, bracket, deadline, source or note that exists in the JSON today but is missing or changed after the import into Postgres.
- A rate edited in the database that is silently overwritten by a later deploy or import.
- A demo that breaks because the database was slow, empty or not migrated yet: the backend must refuse to start on an unmigrated or empty database with a clear message, not serve half-empty screens.
- Two sources of truth that drift: after the first import the database is the only source; the JSON files are never read by the app and never overwrite the database on their own.

## Constraints

- Python 3.10, FastAPI, SQLModel (SQLAlchemy 2) as today. Postgres 17 (`postgres:17-alpine`) locally; the same major on AWS.
- Amounts are minor units and can exceed 32 bits: every money column is `BIGINT`.
- The API contract (`backend/app/schemas.py`, routes) stays as frozen, plus `GET /api/demo/scenarios`.
- skurbro's tax-data build (`backend/tools/tax_data/build.py` → `countries.json`, `legal_forms.json`) and its drift test stay as they are.
- Nothing on the demo path calls the network apart from the backend to its database.

## Approaches considered (tax data)

1. **Hybrid (chosen; nisabu: "do as you recommend").** Real tables and columns for everything the app looks up or someone would edit: countries, regimes and their scalar fields, social contributions, tax parts, the extra pension part, deadlines, sources, legal forms. JSONB only for income-tax brackets (an ordered list read whole by the maths), arrays for `unverified` fields. Moderate schema, the engine's maths unchanged.
2. **One JSON document per country.** Smallest change, but a single rate can't be queried or edited as a field: a file stored in a database.
3. **Fully relational.** Brackets and every nested list in their own tables. Cleanest, about ten more tables and a rewrite of the engine's maths; the most risk before the demo.

## Source of truth (decided by nisabu: option 2)

The database is the source of truth for tax data, the demo seed and the demo scenarios. The JSON produced by skurbro's build fills an empty database once (the import); after that, changes are made to the rows directly, with SQL for now. Considered and rejected: keeping the JSON build as the source with the database as a read copy, which keeps git review of every change but needs a commit and a load to fix a rate.

Consequences:

- The import never overwrites existing data. It only fills empty tables; replacing data needs an explicit `--replace` flag and is recorded.
- Because git no longer records rate changes, the database does: every insert, update and delete on a tax table is written to `tax_change_log` by a trigger (old and new row, time, database user).
- Because rows are edited by hand, the schema guards what the engine relies on with constraints (below).
- skurbro's build script and its drift test keep producing and checking the JSON, which is now the import file for a new environment (a fresh local stack, a new AWS database), not the live data.

## Design

### Settings

- `DATABASE_URL` (required), e.g. `postgresql+psycopg://taxjar:taxjar@db:5432/taxjar`. The backend refuses to start without it.
- `DEMO_MODE` (default `true`): when `false`, `POST /api/demo/reset`, `POST /api/simulate/incoming` and `GET /api/demo/scenarios` return 404. The demo deployment keeps it `true`.
- `TAX_DATA_REFRESH_SECONDS` (default `60`): how long the backend keeps tax data in memory before re-reading it, so a rate edited in SQL shows within a minute without a restart. Required, not optional: an SQL edit creates no load record the backend could watch.

Driver: `psycopg[binary]` 3. Migrations: Alembic.

### Schema

App state (today's tables, kept as they are apart from these changes):

- Money columns become `BIGINT`: balances, jar balances, transaction amounts, reservation source and reserved amounts.
- SQLite's hidden `rowid`, used today to order balances, jars, transactions and reservations, is replaced by an explicit `seq BIGINT GENERATED ALWAYS AS IDENTITY` column on those four tables; every `literal_column("rowid")` goes.
- Timestamps are `TIMESTAMPTZ`.

Tax data (new):

| Table | Key | Columns |
|---|---|---|
| `tax_country` | `code` | `name`, `currency`, `tax_year_start_month`, `tax_year_start_day`, `inherits_from` (FK to `tax_country`, nullable), `position` |
| `tax_regime` | (`country_code`, `id`) | `position`, `name`, `applies_to`, `computable`, `allowance_minor BIGINT`, `income_tax_type`, `income_tax_rate_bp` (nullable), `income_tax_base`, `income_tax_brackets JSONB` (nullable, ordered list as in the JSON), `vat_registration_threshold_minor BIGINT`, `vat_standard_rate_bp`, `suggested_reserve_rate_bp`, `default_rate_bp`, `reserve_rate_source`, `reserve_basis`, `rule_text` (nullable), `hint`, `verification`, `verified_at DATE`, `notes`, `unverified TEXT[]` |
| `tax_social_contribution` | (`country_code`, `regime_id`, `position`) | `name`, `rate_bp`, `base`, `floor_minor`, `cap_minor`, `fixed_annual_minor` (all three `BIGINT`, nullable) |
| `tax_part` | (`country_code`, `regime_id`, `position`) | `part_id`, `name`, `share_num`, `share_den` (the exact per-payment split, `components` in the JSON) |
| `tax_extra_part` | (`country_code`, `regime_id`) | `part_id`, `name`, `rates_bp INT[]` (`extraComponent`) |
| `tax_deadline` | (`country_code`, `regime_id`, `position`) | `name`, `type`, `day`, `month` (nullable), `months INT[]` (nullable), `is_primary BOOLEAN` (the JSON's single `deadline`) |
| `tax_source` | (`country_code`, `regime_id`, `position`) | `url` |
| `legal_form` | `id` identity | `position`, `token`, `name`, `case_sensitive`, `caps_safe`, `caps_leading`, `countries TEXT[]` |
| `tax_data_load` | `id` identity | `loaded_at TIMESTAMPTZ`, `dataset` (`tax`, `demo_seed`, `demo_scenarios`), `mode` (`import` or `replace`), `checksum` (SHA-256 of the files imported), `rows` |
| `tax_change_log` | `id` identity | `changed_at TIMESTAMPTZ`, `db_user`, `table_name`, `operation` (`INSERT`, `UPDATE`, `DELETE`), `old_row JSONB`, `new_row JSONB`; written by a trigger on every tax table and on `legal_form` |

Child rows reference their regime with `ON DELETE CASCADE`. `position` keeps the JSON's order, which the engine and the country list depend on.

Constraints that protect the engine from a bad hand edit: every `*_rate_bp` between 0 and 10000; `share_num` between 1 and `share_den`; deadline `day` between 1 and 31 and `month` between 1 and 12; `type` columns limited to the values the engine handles (taken from the current data); `inherits_from` cannot point at itself; amounts in minor units are not negative. A rejected edit fails in SQL, not in front of the judges.

Demo data (new):

- `demo_seed` (one row, `data JSONB`): the content of `demo/seed.json`, which "Fresh start" restores. A seed is a fixture read whole, so it stays a document.
- `demo_scenario` (`id` PK, `position`, `label`, `sender_name`, `sender_kind`, `amount BIGINT`, `currency`, `reference`, `expect`): `demo/scenarios.json`.

### Loading data

- `backend/app/data_load.py` with a CLI, `python -m app.data_load`. For each of three datasets (tax data from `app/engine/countries.json` and `legal_forms.json`; the demo seed from `demo/seed.json`; the demo scenarios from `demo/scenarios.json`), in one transaction per dataset:
  - tables empty: import, write a `tax_data_load` row with mode `import`;
  - tables not empty: leave them alone and print that the dataset is already in the database (exit 0, so every start of the stack can run it);
  - `--replace <dataset>`: delete and import again, write a row with mode `replace`. The change log records what was replaced. This is the only way the JSON can overwrite the database.
  On a fresh database it also seeds the app state from `demo_seed`.
- Alembic migrations create the schema, constraints and triggers only. Changing a rate is an SQL update, not a migration or an import.
- Order on every start of the stack: `alembic upgrade head`, then `python -m app.data_load`, then the backend.

### How the engine reads tax data

- The engine's maths (`breakdown`, `tax_rules` estimation and deadlines, `classifier`, `legal_forms` matching) stays as it is and keeps working on the same dict shapes it uses today.
- A new `app/engine/data.py` defines `TaxData` (countries list and legal forms list, in today's JSON shapes) and a provider: `get_tax_data() -> TaxData`. The production provider reads the tax tables and rebuilds those shapes; it caches for `TAX_DATA_REFRESH_SECONDS` and re-reads only when the latest `tax_data_load` id or the cache age says so.
- `tax_rules._raw()` and `legal_forms._forms()` read from `get_tax_data()` instead of opening files.
- Engine unit tests can use a provider built from the JSON files, so they stay fast; one round-trip test imports the JSON into an empty Postgres, reads it back through the production provider and asserts the result equals the JSON field for field (the guard for the first anti-goal). It checks the import, not the live data, which may differ by design.
- Tests also cover: a second import leaves an edited rate alone; `--replace` restores it and leaves a change-log entry; an SQL update shows in the API after the refresh interval; each constraint rejects a bad edit.

### Docker Compose

- New `db` service: `postgres:17-alpine`, credentials from `.env` (defaults in `.env.example`), a named volume, `pg_isready` health check. No host port by default; `DB_PORT` in `.env` opens one for local tools.
- New one-shot `migrate` service from the backend image: runs `alembic upgrade head && python -m app.data_load`, waits for `db` healthy.
- `backend` waits for `migrate` to complete successfully, gets `DATABASE_URL` from the environment, loses its SQLite volume.
- `docker compose down -v` starts from the seed again, as today.

### Tests

- Backend tests run against Postgres from `TEST_DATABASE_URL`; `docker compose up -d db` (with `DB_PORT` open) provides it locally. The test session creates a fresh database, runs the Alembic migrations and the data load once, and each test runs inside a transaction that is rolled back, so tests stay independent and fast.
- No SQLite path remains in the code or the tests.
- Golden path: run against the Compose stack (`BASE=http://taxjar.test:8080`) and against the dev setup.

### What changes in the frontend

- The simulator and the sidebar's demo buttons read scenarios from `GET /api/demo/scenarios` instead of importing `demo/scenarios.json` at build time.

## Left to the builder

- Alembic layout and naming; how the SQLModel models declare `BIGINT`, arrays and JSONB.
- How the provider maps rows back to the exact JSON shapes (the round-trip test is the judge).
- The error message and exit code when the database is unmigrated or empty.
- How the test fixture creates and drops its database.
