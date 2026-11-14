# Backend: FastAPI on Python 3.10, the version the plan requires.
# Build context is the repo root (see compose.yaml). The same image runs the migrations and the
# data import (the `migrate` service, which reads demo/ and app/engine/*.json) and the API.
# Base image pinned by digest; bump tag and digest together.
FROM python:3.10-slim@sha256:6ff506466f8b1e981719b468cc0023b8ef000b983cdec0eafe119d01f379e31d

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY demo/ /srv/demo/
COPY backend/ /srv/backend/

# All state lives in Postgres (DATABASE_URL). Run as a non-root user.
RUN useradd --create-home --uid 1000 app
USER app

EXPOSE 8000
# /api/healthz: the process runs and the database answers; reads no demo data.
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=10 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/healthz', timeout=2)"
# On SIGTERM uvicorn stops accepting and waits for open requests; the live event stream (/api/events)
# never finishes on its own, so after 10 s the rest are closed. Kubernetes allows 30 s before SIGKILL.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "10"]
