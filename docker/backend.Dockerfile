# Backend: FastAPI on Python 3.10, the version the plan requires.
# Build context is the repo root (see compose.yaml): the app reads ../demo/seed.json.
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY demo/ /srv/demo/
COPY backend/ /srv/backend/

# SQLite lives in data/, which compose mounts as a volume. Run as a non-root user.
RUN useradd --create-home --uid 1000 app && mkdir -p data && chown app:app data
USER app

EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=10 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/account', timeout=2)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
