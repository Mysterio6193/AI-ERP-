# Production readiness

Audit and remediation, 2026-08-22. Fixed items are done and verified; the rest
are open with the reasoning for why they matter.

## Fixed

### Forgeable sessions (critical)

`ADMIN_SESSION_SECRET` and `DRIVER_SESSION_SECRET` each fell back to a hardcoded
string in the repository. A deployment that forgot to set them signed sessions
with a publicly known key — anyone who had read the source could mint an admin
token.

`src/lib/env-guard.ts` now refuses to start in production when either is unset
or still set to the known development value. Development is unaffected: it warns
and keeps working. Verified across six deployment scenarios.

### No brute-force protection

Login and OTP verification were unthrottled. A six-digit OTP is a million
guesses, which is minutes of unattended work.

`src/lib/rate-limit.ts` adds fixed-window limits: 8 login attempts per
address+email per 5 minutes, 10 OTP attempts per email per 10 minutes. A
successful attempt clears the counter so a legitimate mistype does not lock
anyone out. Verified: an OTP brute force is stopped after 10 of 1,000,000
guesses.

**Limitation, deliberately:** the store is in-process. It protects one instance
and resets on deploy. Move it to Redis before running more than one instance, or
an attacker just spreads attempts across processes.

### Query logging in production

`db.ts` had `log: ['query']`, echoing every statement and its row data into the
log stream. Now warnings and errors only, with `PRISMA_LOG_QUERIES=true` as an
opt-in for debugging.

### No health check

`GET /api/health` returns 200/503 for a load balancer. Anonymous callers get
only ok/degraded — the configuration detail is admin-only, because a list of
missing secrets is a map of how to attack the deployment.

## Open

### SQLite (blocking, for anything beyond one small instance)

`provider = "sqlite"` with the database on local disk. Single-writer, does not
survive a container restart on ephemeral storage, and cannot be shared by two
instances. The env guard warns about this in production.

Migrating to Postgres is a provider change plus a data copy. Everything else in
the schema is portable.

### No migrations

There is no `prisma/migrations` directory — the schema is applied with
`prisma db push`. That is fine while iterating and wrong in production: there is
no ordered history, no review of what a deploy will do to live data, and no way
back. Before the first real deploy, baseline with
`prisma migrate dev --create-only` and move deploys to `prisma migrate deploy`.

### Demo data must not reach production

`prisma/seed-au.ts`, `seed-rdm.ts` and `seed-carriers.ts` create users with the
password `password123`. They are development fixtures. Ensure the production
database is seeded only via the real setup flow, and that no seed script is
wired into the production start path. (It currently is not.)

### Deliberate error exposure

`src/lib/agent/stream.ts` returns raw provider errors to the browser, with a
comment explaining the tradeoff: this is an internal operations tool and the
message is usually the fix. That reasoning holds for staff surfaces. Revisit it
before any agent surface is exposed to customers, since provider errors can
carry configuration detail.

### No backup or restore procedure

Not written down anywhere. Whatever the database ends up being, the restore path
needs to be documented and tested before go-live, not after the first incident.

## Required environment

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Connection string |
| `ADMIN_SESSION_SECRET` | yes in prod | Signs admin sessions. 32+ random bytes |
| `DRIVER_SESSION_SECRET` | yes in prod | Signs driver sessions. 32+ random bytes |
| `AI_GATEWAY_API_KEY` | for agents | Model access. Agents fail without it |
| `CRON_SECRET` | for schedules | Authenticates the scheduler tick |
| `AUTH_BYPASS` | never in prod | Dev only; ignored in production builds |
| `PRISMA_LOG_QUERIES` | no | Opt-in query logging |

Generate secrets with `openssl rand -hex 32`.
