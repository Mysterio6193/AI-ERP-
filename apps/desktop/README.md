# SupplySure OS — desktop

A real local install: the app carries its own Node runtime, its own Postgres
and its own copy of the server, and runs with no network at all. It is not a
window onto a hosted instance.

## Layout

| Path | What it is |
|---|---|
| `supervisor/` | Boots and stops the bundled stack. **No GUI dependency**, so it compiles and its tests run anywhere — including CI and this container. |
| `src-tauri/` | The window. Thin: it resolves bundled paths and calls the supervisor. |
| `scripts/bundle.mjs` | Assembles `dist/` — server, Node, Postgres, migrations, Prisma CLI — and verifies the result. |

The split is deliberate. Everything that can fail interestingly at launch —
initialising a cluster, creating the database, applying migrations, waiting for
health, shutting down without orphaning a process — lives in the supervisor,
where it is tested on every platform. A failure inside a signing job is
expensive to diagnose; the same failure in `cargo test` is not.

## Boot sequence

1. Pick two free ports (the database and the server), so two copies and
   anything else the user runs cannot collide.
2. First launch only: `initdb`, then create the `supplysure` database using
   `postgres --single`. The bundle ships only `initdb`, `pg_ctl` and
   `postgres`, so there is no `createdb` to call.
3. `prisma migrate deploy`, **before** the server. Starting first would open a
   window onto a database with no tables.
4. Start the server, poll `/api/health` until it answers, then show the window.
5. On close: server first, then Postgres. The reverse order can leave the
   cluster needing recovery. Both are killed on drop, so a GUI panic cannot
   orphan a Postgres holding the data directory lock.

## Running it without a window

```bash
npm run build                       # repo root, produces .next/standalone
node apps/desktop/scripts/bundle.mjs
cargo run --manifest-path apps/desktop/supervisor/Cargo.toml --bin supplysure-serve -- \
  --node   apps/desktop/dist/runtime/node \
  --server apps/desktop/dist/server/server.js \
  --pg-bin apps/desktop/dist/pgsql/bin \
  --bundle apps/desktop/dist \
  --data   ~/.supplysure-dev
```

It prints the URL once healthy. Postgres refuses to run as root, as on any
real desktop — use an ordinary user account.

## Installers

`.github/workflows/desktop.yml` builds them on the platform they target, since
a signed `.dmg` needs macOS and a signed installer needs Windows. Supply the
signing certificates as repository secrets; without them the build still
produces installers, but unsigned ones that Gatekeeper and SmartScreen warn
about.

## Licensing

A desktop install is self-hosted by definition, so it uses the offline licence
path: set `LICENSE_PUBLIC_KEY`, and activate a key issued by
`scripts/issue-license.ts` from Settings → Subscription. Verification is a
signature check with no outbound call.
