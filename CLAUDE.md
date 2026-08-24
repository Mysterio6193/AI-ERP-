# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project

**SupplySure OS** (`supplysure-os`, v0.2.0) — an AI-native ERP and supply chain
platform: procurement, multi-warehouse inventory, sales/fulfilment, last-mile
delivery, double-entry accounting, and an autonomous agent layer that acts on
schedules and webhooks.

Stack: Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind v4 ·
Prisma 6 + PostgreSQL · Vercel AI SDK (`ai` v7) · NextAuth-adjacent custom
sessions · Vitest.

Two apps: the core ERP at the repo root (port 3000) and a driver PWA at
`apps/driver-app` (port 3001) that proxies to the core app via `CORE_APP_URL`.

## Commands

```bash
npm run dev              # core app, port 3000 (tees to dev.log)
npm run dev:driver       # driver PWA, port 3001
npm run build            # next build + copies static/public into standalone
npm run start            # ./scripts/start-production.sh

npm run lint             # eslint
npm run test             # vitest run
npm run test:watch
npm run typecheck:driver # driver app only; core app is type-checked by next build

npm run db:push          # push schema (dev)
npm run db:migrate       # create/apply a migration
npm run db:generate      # regenerate Prisma client
npm run db:seed          # prisma/seed.ts
npm run pg:start         # embedded postgres (scripts/pg.mjs)
```

Verification scripts live in `scripts/verify-*.ts` and run against the dev
database (`npx tsx --env-file=.env scripts/verify-ledger.ts`). Use them for
flow-level behaviour that unit tests deliberately skip.

## Layout

```
src/app/            App Router pages + 134 API route handlers under src/app/api/
src/lib/            business logic — one file per domain (invoicing, pricing,
                    ledger, tax, reservations, freight, returns, …)
src/lib/agent/      the agent runtime: definitions, policy, scheduler, memory,
                    channels/ (telegram), tools/ (~30 tool modules)
src/components/     UI (shadcn/ui + Radix, in src/components/ui)
src/middleware.ts   the request gate — must stay under src/
prisma/schema.prisma  87 models, ~3k lines
apps/driver-app/    separate Next app, own tsconfig and deps
docs/               PRODUCT_PRD.md, SCHEDULED_AGENTS.md, PRODUCTION_READINESS.md
```

Import alias: `@/*` → `./src/*`.

## Conventions that matter here

**Auth is deny-by-default and layered.** `src/middleware.ts` guarantees no page
or API route is reachable by a stranger with a URL, but it only checks that
*some* credential is present. Real authorisation belongs in the route:

```ts
const auth = await requireAdminUser(request, ROLE_SETS.finance)
if (auth.response) return auth.response
```

Use the named sets in `src/lib/permissions.ts` (`adminOnly`, `commercial`,
`finance`, `accounting`, `operations`, `staff`) — do not inline role arrays.

**Multi-entity tenancy.** The install can hold several legal entities with
separate ABNs. Never resolve the company with `db.company.findFirst()`; use
`src/lib/active-company.ts`, which honours the user's switched entity, then
their own company, then the single-company fallback.

**Agent model resolution is provider-agnostic.** `src/lib/agent/model.ts`
selects between `google`, `openrouter`, `local` (any OpenAI-compatible server),
and `gateway` from `AGENT_PROVIDER` or from whichever keys exist. Don't hardcode
a provider or model id; add an env-driven default alongside the existing ones.

**Tests are for pure logic.** `vitest.config.mts` includes `src/**/*.test.ts` in
a node environment, scoped to functions that take their inputs as arguments
rather than reaching for the database. Keep DB-dependent checks in
`scripts/verify-*.ts`.

**Comments explain why, not what.** Existing modules open with a docblock giving
the reason the code is shaped that way — often the bug it prevents (see
`active-company.ts`, `permissions.ts`, `middleware.ts`). Match that when adding
a module; skip narration of what the next line obviously does.

**Formatting.** No Prettier, and ESLint has most stylistic rules disabled — so
match the file you are editing. `src/lib` is 2-space, no semicolons; several
API routes are 4-space. Do not reformat a file you are only patching.

**Secrets.** `src/lib/env-guard.ts` refuses to boot on dev fallback session
secrets in production. `AUTH_BYPASS`, `CUSTOMER_OTP_EXPOSE`, and
`PRISMA_LOG_QUERIES` are development-only. Never commit `.env`; keep
`.env.example` current when adding a variable.

## Working guidelines

Adapted from Andrej Karpathy's notes on LLM coding pitfalls. These bias toward
caution over speed; use judgement on trivial tasks.

### 1. Think before coding

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop and name what's confusing.

### 2. Simplicity first

The minimum code that solves the problem, nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No configurability that wasn't requested.
- No error handling for impossible scenarios.
- If it's 200 lines and could be 50, rewrite it.

Test: would a senior engineer call this overcomplicated?

### 3. Surgical changes

Touch only what you must; clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor what isn't broken.
- Match existing style even where you'd do it differently.
- Mention unrelated dead code; don't delete it.
- Do remove imports and variables that *your* change orphaned.

Test: every changed line traces directly to the request.

### 4. Goal-driven execution

Turn tasks into verifiable goals and loop until they pass.

- "Add validation" → write tests for invalid inputs, then make them pass.
- "Fix the bug" → write a test that reproduces it, then make it pass.
- "Refactor X" → tests green before and after.

For multi-step work, state the plan with a check per step:

```
1. [step] → verify: [check]
2. [step] → verify: [check]
```
