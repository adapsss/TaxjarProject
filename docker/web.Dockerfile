# Web: builds frontend/ and serves it with Caddy, which is also the gateway
# for both hostnames (live app and simulator) and proxies /api to the backend.
# Build context is the repo root (see compose.yaml). Demo scenarios come from the API, not the build.
FROM node:24-slim AS build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM caddy:2-alpine
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/frontend/dist /srv/www
