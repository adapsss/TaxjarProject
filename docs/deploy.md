# Deployment

Production runs on AWS EKS (eu-west-1), managed in the infra repo **nisabu/TaxjarProject-infra** (Terraform + Argo CD). See its README for apply, operations and teardown.

Flow: push to `main` → **CI** passes → **images** workflow builds `goyslop-backend` and `goyslop-web` and pushes both as `dev-NNNNNN` (the run number, zero-padded to 6 digits, e.g. `dev-000011`) to ECR (OIDC role `goyslop-dev-github-ci`, set in the workflow) → Argo CD Image Updater commits the new tag to the infra repo → Argo CD runs the migrations (`alembic upgrade head && python -m app.data_load`) and rolls out backend and web.

Rollback: delete the bad `dev-NNNNNN` tag from both ECR repos, or push a fix. Image Updater deploys the alphabetically highest tag matching `^dev-[0-9]{6}$`; the older unpadded `dev-N` tags are ignored.

Data: RDS is the source of truth. The JSON import files in the image (`backend/app/engine/*.json`, `demo/*.json`) are bootstrap-only: the migrate step uses them only to fill empty tables, and skips filled ones without reading them. On an empty database without usable files it exits 1 with the file and the problem named, so the rollout stops and nothing is written.

**A release that added a migration cannot be rolled back by its tag alone.** The backend refuses to start when the database is not at the revision its code expects (`check_database` in `backend/app/main.py`), and an older image does not know the newer revision. For such a release, either push a fix forward (preferred), or first take the schema back with the newer image, then delete the tag:

```sh
# in a pod or job running the NEWER backend image; <revision> is the one the older image expects
alembic downgrade <revision>
```

Every migration in `backend/migrations/versions/` has a `downgrade()`. 0005 (CHECK constraints on the money tables) only drops its constraints again and changes no data. Applying 0005 fails, and stops the rollout, if a row already breaks one of its checks: count such rows first on a database that has been edited by hand (the conditions are listed in the migration).

**Backups.** Nothing in this repo backs up the database, and `alembic downgrade` does not bring back data. Before a release with a migration, and on a schedule in any environment whose data matters, take a dump (or use the database service's snapshots, configured in the infra repo):

```sh
pg_dump --format=custom --file=taxjar-$(date +%F).dump "$DATABASE_URL_FOR_PSQL"   # postgresql://USER:PASSWORD@HOST:5432/DB
pg_restore --clean --if-exists --dbname="$DATABASE_URL_FOR_PSQL" taxjar-YYYY-MM-DD.dump
```

**Load.** The backend works on at most 16 API requests at once (12 reads, 4 writes; `backend/app/limits.py`) and uses up to 22 database connections per process; further requests wait their turn instead of failing. A write's body is read first and must arrive within 10 s and be at most 1 MB (else 408 or 413), so a stalled upload holds no slot. The event stream and the health check are not counted.

**One backend replica.** Live updates (`GET /api/events`) come from an event bus inside the backend process. With two or more replicas a browser only hears about changes made through the replica its stream is connected to, until its next refresh. Money stays correct with any number of replicas (every write takes the account lock in Postgres); only the live updates need a single replica until the bus moves to a shared channel such as Postgres `LISTEN/NOTIFY`.

**No login.** The prototype has one account and no authentication: anyone who can reach the URL can read it, pay the tax and download the CSV export. Keep `DEMO_MODE` off, or the URL private, wherever that matters.

App URL: https://taxjar.niks-uni.online (or the ALB hostname until DNS is set up).

## Runtime configuration

Everything environment-specific comes from environment variables; nothing is baked into the code or the images. On AWS the values come from SSM Parameter Store through External Secrets (infra repo). Locally, `compose.yaml` and `.env` (copy `.env.example`) set them.

| Variable | Used by | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | backend, migrate | none (required) | `postgresql+psycopg://USER:PASSWORD@HOST:5432/DB`. Never logged. |
| `DEMO_MODE` | backend | off (`compose.yaml`: `true`) | Only `true` (or `1`, `yes`, `on`) serves `POST /api/demo/reset`, `POST /api/simulate/incoming` and `GET /api/demo/scenarios`; otherwise they answer 404. They wipe the account and credit money without a login, so an unset variable means off. **The demo deployment must set `DEMO_MODE=true` in the infra repo**, or the simulator and Fresh start stop working. |
| `TAX_DATA_REFRESH_SECONDS` | backend | `60` | How long tax data is kept in memory before it is read from the database again. |
| `LOG_LEVEL` | backend | `INFO` | `DEBUG`, `INFO`, `WARNING` or `ERROR`. Logs go to stderr, one leveled line per record. |
| `BACKEND_UPSTREAM` | web (Caddy) | `backend:8000` | Where Caddy proxies `/api/*`, `/docs` and `/openapi.json`. |

Fixed contract: backend listens on `:8000`, web on `:80`; health check `GET /api/healthz` (process up and database answers, no demo data read; `GET /api/account` still works); migrations `sh -c "alembic upgrade head && python -m app.data_load"`. On SIGTERM the backend stops within about 10 s, closing open event streams.

Logs: one line per request (`app.request`: method, path, status, milliseconds), and every line written while a request is handled carries its id in brackets, including the error line and the 500 response of a crash. The id is the caller's `X-Request-ID` when it sent one (letters, digits, `.`, `_`, `-`; at most 64), else generated; it is returned in the `X-Request-ID` response header. There are no metrics yet.
