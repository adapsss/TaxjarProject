# Run the whole demo with Docker

One command runs Postgres, the migrations and data import, the backend (Python 3.10), the frontend build and a gateway (Caddy) with one port per app:

| URL | What |
|---|---|
| http://taxjar.test:8080 | The live app |
| http://simulator.taxjar.test:8081 | The simulator: sends test transactions to the app |
| http://taxjar.test:8080/docs | The backend's API docs |

Payments sent from the simulator show up live in the app (toast, work question) over the event stream.
The ports pick the app; the names are just friendlier than `localhost` (any name pointing at 127.0.0.1 works).

## Once: point the two names at your machine

```bash
grep -q 'taxjar.test' /etc/hosts || echo '127.0.0.1 taxjar.test simulator.taxjar.test' | sudo tee -a /etc/hosts
```

`.test` is a reserved top-level domain, so these names never clash with real sites.

## Start, stop, reset

```bash
docker compose up --build -d     # build and start (first build takes a few minutes)
docker compose logs -f           # follow the logs
docker compose down              # stop; all data is kept in the db-data volume
docker compose down -v           # stop and wipe the database: next start imports the JSON and the seed again
```

The simulator's **Fresh start** button also resets the data without restarting anything.

## Settings

Copy `.env.example` to `.env` to change them:

- `APP_PORT` (default 8080) and `SIMULATOR_PORT` (default 8081): the host ports.
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (default `taxjar` for all three). Change the password for anything but a laptop.
- `DB_PORT` (default 5433): Postgres on `127.0.0.1` for local tools and the backend tests. Never published on other interfaces.
- `DEMO_MODE` (default `true`): `false` removes the reset, simulator and demo-scenario routes.
- `TAX_DATA_REFRESH_SECONDS` (default 60): how soon a tax rate edited in the database reaches the app.

## Known quirk

The app and the simulator are on different ports, so the browser treats them as different origins.
When the simulator sets up the **Filled** state, it cannot tell the app tab to keep those setup payments quiet,
so the app shows a toast for them. Opening the simulator on the app's own port (http://taxjar.test:8080/simulator) avoids it.

## What runs

- `db`: Postgres 17, data in the `db-data` volume.
- `migrate`: a one-off from the backend image. It runs `alembic upgrade head`, then `python -m app.data_load`, which imports the tax data, the demo seed and the demo scenarios into empty tables only, and exits. On later starts it prints "already present" and leaves the data alone, including anything edited in the database. The backend starts only after it succeeds.
- `backend`: `docker/backend.Dockerfile`, FastAPI on Python 3.10, reading and writing Postgres. It refuses to start if the database is not migrated or imported. Not published on the host; reach it through either port at `/api`.
- `web`: `docker/web.Dockerfile` builds `frontend/` and serves it with Caddy (`docker/Caddyfile`), which proxies `/api` (including the event stream), `/docs` and `/openapi.json` to the backend.

Run the backend tests on Python 3.10 inside the image, against a test database on the same Postgres:

```bash
docker compose exec db psql -U taxjar -c "create database taxjar_test"   # once
docker compose run --rm --no-deps -e TEST_DATABASE_URL=postgresql+psycopg://taxjar:taxjar@db:5432/taxjar_test \
  backend python -m pytest -q -p no:cacheprovider
```

Run the frontend's golden path against the stack (needs `npm install` and `npx playwright install chromium` in `frontend/`):

```bash
cd frontend && BASE=http://taxjar.test:8080 npm run golden
```
