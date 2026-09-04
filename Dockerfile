# syntax=docker/dockerfile:1.7
# ==============================================================================
# SupplySure OS — single multi-stage build for both apps.
#
# Three Dockerfiles used to carry near-identical `deps` stages, so a dependency
# change had to be made in three places and the images drifted. One file means
# one dependency layer, shared by the dev container, the core ERP runner and the
# driver PWA runner — and BuildKit caches it once for all of them.
#
# Targets:
#   dev     — hot-reloading container for either app (source arrives by mount)
#   core    — production runner for the core ERP  (Next.js standalone, :3000)
#   driver  — production runner for the driver PWA (Next.js standalone, :3001)
#
# The base image is pinned by digest, not by a floating tag: a `node:22-slim`
# that silently moves underneath you turns a reproducible build into a guess.
# ==============================================================================

ARG NODE_IMAGE=node:22.23.2-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436

# ── base ─────────────────────────────────────────────────────────────────────
# openssl is required by the Prisma query engine on Debian; nothing else is
# installed, because every extra package is extra attack surface in the runner.
FROM ${NODE_IMAGE} AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1 \
    npm_config_update_notifier=false \
    npm_config_fund=false \
    npm_config_audit=false
# Owned by `node` before anything is written into it, so every later stage can
# install and build unprivileged. Chowning after the fact instead cost 169s of
# build time recursing through node_modules — and a root-owned build step is
# worth avoiding on its own account.
RUN mkdir -p /app && chown node:node /app
WORKDIR /app

# ── deps: full dependency tree (dev + prod) ──────────────────────────────────
# `prisma/` is copied before `npm ci` because the prisma package's postinstall
# reads the schema. The cache mount keeps the npm tarball cache out of the image
# layer, so a lockfile bump re-resolves without re-downloading the world; it is
# owned by uid 1000 because the install runs as `node`, not root.
FROM base AS deps
USER node
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000,sharing=locked \
    npm ci --include=dev
# Stamp the tree with the lockfile that produced it. The dev container's
# node_modules volume is initialised from this layer, so without the stamp the
# entrypoint sees an unstamped volume on first boot and reinstalls the whole
# dependency tree over the network — for a result byte-identical to what the
# image already contains.
RUN md5sum package-lock.json | cut -d' ' -f1 | tr -d '\n' > node_modules/.stamp-deps

# ── deps-prod: runtime-only dependency tree ──────────────────────────────────
# Built separately so the devDependency toolchain stays out of the shipped
# images while the core runner still gets the Prisma CLI its entrypoint needs.
FROM base AS deps-prod
USER node
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000,sharing=locked \
    npm ci --omit=dev

# ── dev: hot reload ──────────────────────────────────────────────────────────
# No `COPY . .` on purpose. Source is bind-mounted by compose so an edit on the
# host is the same file the dev server is watching — copying it in would give
# you a stale snapshot that only a rebuild could refresh.
#
# node_modules and .next live on named volumes that shadow the mount, because
# the host's node_modules were built against a different libc and Prisma engine
# target than this image.
FROM deps AS dev
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends netcat-openbsd tini \
    && rm -rf /var/lib/apt/lists/*
COPY --chmod=755 docker/dev-entrypoint.sh /usr/local/bin/dev-entrypoint.sh
USER node
# Generate the client and stamp it here too, for the same reason: the volume
# inherits both, so a first boot starts the dev server instead of regenerating.
RUN npx prisma generate \
    && md5sum prisma/schema.prisma | cut -d' ' -f1 | tr -d '\n' > node_modules/.stamp-prisma
# Mount points for the .next volumes, created as `node` so the volumes Docker
# initialises from them are writable by the dev server.
RUN mkdir -p /app/.next /app/apps/driver-app/.next
ENV NODE_ENV=development \
    HOSTNAME=0.0.0.0 \
    WATCHPACK_POLLING=true \
    CHOKIDAR_USEPOLLING=true
EXPOSE 3000 3001
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/dev-entrypoint.sh"]

# ── build-core ───────────────────────────────────────────────────────────────
# DATABASE_URL is a syntactically valid placeholder, never a reachable host:
# `next build` imports modules that construct a PrismaClient, which throws on an
# unparseable URL. Nothing connects at build time.
FROM deps AS build-core
COPY --chown=node:node . .
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=4096 \
    DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder
RUN npx prisma generate
RUN npm run build

# ── build-driver ─────────────────────────────────────────────────────────────
FROM deps AS build-driver
COPY --chown=node:node . .
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=4096
RUN npm --prefix apps/driver-app run build
# Guarantee public/ exists so the runner COPY never fails on a missing directory.
# The driver PWA has no static assets today; this is a zero-cost no-op when the
# directory is added later.
RUN mkdir -p apps/driver-app/public

# ── core: production runner for the ERP ──────────────────────────────────────
FROM base AS core
RUN apt-get update \
    && apt-get install -y --no-install-recommends netcat-openbsd tini \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# `npm run build` already folds static/ and public/ into the standalone tree.
COPY --from=build-core --chown=node:node /app/.next/standalone ./

# Prisma and runtime dependencies stay in the runner so the entrypoint can apply
# migrations before the server accepts traffic. Taken from deps-prod, not from the
# builder, to avoid dragging the dev tree along.
COPY --from=deps-prod  --chown=node:node /app/node_modules ./node_modules
COPY --from=build-core --chown=node:node /app/prisma       ./prisma
COPY --chmod=755 docker/prod-entrypoint.sh /usr/local/bin/prod-entrypoint.sh

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/prod-entrypoint.sh"]
CMD ["node", "server.js"]

# ── driver: production runner for the PWA ────────────────────────────────────
# The driver app holds no database credentials and imports nothing from the core
# app's src/ — it reaches the ERP over CORE_APP_URL. So it ships without Prisma,
# without the schema, and without the core source tree.
FROM base AS driver
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0

COPY --from=build-driver --chown=node:node /app/apps/driver-app/.next/standalone ./
COPY --from=build-driver --chown=node:node /app/apps/driver-app/.next/static ./apps/driver-app/.next/static
COPY --from=build-driver --chown=node:node /app/apps/driver-app/public ./apps/driver-app/public

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/driver-app/server.js"]
