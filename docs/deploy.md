# Deployment

Production runs on AWS EKS (eu-west-1), managed in the infra repo **nisabu/goyslop-infra** (Terraform + Argo CD). See its README for apply, operations and teardown.

Flow: push to `main` → **CI** passes → **images** workflow builds `goyslop-backend` and `goyslop-web` and pushes both as `dev-<run number>` to ECR (OIDC role `goyslop-dev-github-ci`, set in the workflow) → Argo CD Image Updater commits the new tag to the infra repo → Argo CD runs the migrations (`alembic upgrade head && python -m app.data_load`) and rolls out backend and web.

Rollback: delete the bad `dev-N` tag from both ECR repos, or push a fix.

App URL: https://taxjar.niks-uni.online (or the ALB hostname until DNS is set up).
