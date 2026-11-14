# Web: builds frontend/ and serves it with Caddy, which is also the gateway
# for both hostnames (live app and simulator) and proxies /api to the backend.
# Build context is the repo root (see compose.yaml). Demo scenarios come from the API, not the build.
# Base images pinned by digest; bump tag and digest together.
FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS sources
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./

# Lint and unit tests. Not part of the shipped image: the deploy pipeline builds this
# stage on its own (`--target test`) and stops if it fails.
FROM sources AS test
RUN npx oxlint src && npm test

FROM sources AS build
RUN npm run build

FROM caddy:2-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0
# Run as uid 1000, not root. Binding :80 as non-root needs the one capability for it.
RUN apk add --no-cache libcap \
 && setcap cap_net_bind_service=+ep /usr/bin/caddy \
 && apk del libcap \
 && addgroup -g 1000 app && adduser -D -H -u 1000 -G app app \
 && chown -R app:app /config /data
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/frontend/dist /srv/www
USER 1000:1000
