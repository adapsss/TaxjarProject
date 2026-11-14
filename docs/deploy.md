# Deployment

Production runs on AWS EKS (eu-west-1), managed in the infra repo **nisabu/goyslop-infra** (Terraform + Argo CD). See its README for apply, operations and teardown.

Flow: push to `main` → **CI** passes → **images** workflow builds `goyslop-backend` and `goyslop-web` and pushes both as `dev-<run number>` to ECR (OIDC role `goyslop-dev-github-ci`, set in the workflow) → Argo CD Image Updater commits the new tag to the infra repo → Argo CD runs the migrations (`alembic upgrade head && python -m app.data_load`) and rolls out backend and web.

Rollback: delete the bad `dev-N` tag from both ECR repos, or push a fix.

App URL: https://taxjar.niks-uni.online (or the ALB hostname until DNS is set up).

## Runtime configuration

Everything environment-specific comes from environment variables; nothing is baked into the code or the images. On AWS the values come from SSM Parameter Store through External Secrets (infra repo). Locally, `compose.yaml` and `.env` (copy `.env.example`) set them.

| Variable | Used by | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | backend, migrate | none (required) | `postgresql+psycopg://USER:PASSWORD@HOST:5432/DB`. Never logged. |
| `DEMO_MODE` | backend | `true` | `false` removes `POST /api/demo/reset`, `POST /api/simulate/incoming` and `GET /api/demo/scenarios` (404). |
| `TAX_DATA_REFRESH_SECONDS` | backend | `60` | How long tax data is kept in memory before it is read from the database again. |
| `LOG_LEVEL` | backend | `INFO` | `DEBUG`, `INFO`, `WARNING` or `ERROR`. Logs go to stderr, one leveled line per record. |
| `BACKEND_UPSTREAM` | web (Caddy) | `backend:8000` | Where Caddy proxies `/api/*`, `/docs` and `/openapi.json`. |

Fixed contract: backend listens on `:8000`, web on `:80`; health check `GET /api/healthz` (process up and database answers, no demo data read; `GET /api/account` still works); migrations `sh -c "alembic upgrade head && python -m app.data_load"`. On SIGTERM the backend stops within about 10 s, closing open event streams.
