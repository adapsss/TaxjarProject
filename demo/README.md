# Demo data (bootstrap-only)

- `seed.json`: what "Fresh start" restores, the starting account for a new database.
- `scenarios.json`: the simulator's demo payments.

The running app never reads these files. `python -m app.data_load` copies them into Postgres once, when the `demo_seed` and `demo_scenario` tables are empty (a fresh local stack, CI and tests, a new AWS environment); from then on the database is the source of truth. A changed file reaches an existing database only with `python -m app.data_load --replace demo_seed` (or `demo_scenarios`), which overwrites what is stored there.
