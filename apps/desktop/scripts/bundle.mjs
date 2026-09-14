/**
 * Assembles everything the desktop app ships with, into apps/desktop/dist.
 *
 * Three things go in, and each is a separate way a release can be broken:
 *
 *   - server/   the Next standalone build, plus the static assets it does not
 *               copy itself. Missing those is the classic standalone mistake:
 *               the app boots, serves HTML, and every stylesheet 404s.
 *   - runtime/  the Node binary. The customer is not required to have Node,
 *               and picking up whatever version they happen to have is how a
 *               release works on one machine and not another.
 *   - pgsql/    the platform's Postgres binaries from embedded-postgres.
 *
 * Verifies what it produced rather than trusting the copies, because a bundle
 * that is wrong here fails on a customer's machine with no useful message.
 */
import { cpSync, existsSync, mkdirSync, rmSync, statSync, readdirSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const desktop = path.resolve(here, "..")
const repo = path.resolve(desktop, "..", "..")
const dist = path.join(desktop, "dist")

const PLATFORM_PACKAGE = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "linux-arm64": "linux-arm64",
  "linux-x64": "linux-x64",
  "win32-x64": "windows-x64",
}[`${process.platform}-${process.arch}`]

function fail(message) {
  console.error(`\n  ✖ ${message}\n`)
  process.exit(1)
}

function step(message) {
  console.log(`  · ${message}`)
}

function copy(from, to, what) {
  if (!existsSync(from)) {
    fail(`${what} not found at ${from}`)
  }
  mkdirSync(path.dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true, dereference: true })
}

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

// ── the server ───────────────────────────────────────────────────────────────
const standalone = path.join(repo, ".next", "standalone")

if (!existsSync(standalone)) {
  fail("no .next/standalone — run `npm run build` in the repo root first")
}

step("copying the standalone server")
copy(standalone, path.join(dist, "server"), "standalone build")

// Next does not copy these into standalone; without them the app serves HTML
// with no CSS and no images, which looks like a broken install.
step("copying static assets")
copy(path.join(repo, ".next", "static"), path.join(dist, "server", ".next", "static"), "static assets")

if (existsSync(path.join(repo, "public"))) {
  copy(path.join(repo, "public"), path.join(dist, "server", "public"), "public assets")
}

// ── the Node runtime ─────────────────────────────────────────────────────────
step("copying the Node runtime")
const nodeBinary = process.execPath
const nodeName = process.platform === "win32" ? "node.exe" : "node"
copy(nodeBinary, path.join(dist, "runtime", nodeName), "node binary")

// ── Postgres ─────────────────────────────────────────────────────────────────
if (!PLATFORM_PACKAGE) {
  fail(`no embedded-postgres build for ${process.platform}-${process.arch}`)
}

const pgNative = path.join(
  repo,
  "node_modules",
  "@embedded-postgres",
  PLATFORM_PACKAGE,
  "native"
)

if (existsSync(pgNative)) {
  step(`copying Postgres (${PLATFORM_PACKAGE})`)
  copy(pgNative, path.join(dist, "pgsql"), "postgres binaries")
} else {
  // Not fatal in a dev bundle: the supervisor copes with Postgres being absent
  // and falls back to DATABASE_URL. It is fatal for a release, so say so.
  console.warn(`  ! no Postgres binaries at ${pgNative} — this bundle needs an external database`)
}

// ── migrations ───────────────────────────────────────────────────────────────
// Without these the app boots onto an empty database: the server answers, the
// window opens, and every page fails because not one table exists. The Prisma
// CLI is bundled so `migrate deploy` can run on the customer's machine at
// first launch, with no network and no global install.
step("copying migrations and the Prisma CLI")
copy(path.join(repo, "prisma"), path.join(dist, "prisma"), "prisma directory")
copy(
  path.join(repo, "node_modules", "prisma"),
  path.join(dist, "migrator", "node_modules", "prisma"),
  "prisma CLI"
)
copy(
  path.join(repo, "node_modules", "@prisma", "engines"),
  path.join(dist, "migrator", "node_modules", "@prisma", "engines"),
  "prisma engines"
)

// ── verify ───────────────────────────────────────────────────────────────────
const required = [
  ["server/server.js", "the server entrypoint"],
  [`runtime/${nodeName}`, "the Node runtime"],
  ["server/.next/static", "static assets"],
  ["prisma/schema.prisma", "the Prisma schema"],
  ["prisma/migrations", "the migrations"],
  ["migrator/node_modules/prisma/build/index.js", "the Prisma CLI"],
]

for (const [relative, what] of required) {
  const target = path.join(dist, relative)
  if (!existsSync(target)) {
    fail(`bundle is missing ${what} (${relative})`)
  }
}

// The runtime must actually run. A copied binary that will not execute — the
// wrong architecture, or a lost executable bit — is otherwise only discovered
// by a customer.
try {
  const version = execFileSync(path.join(dist, "runtime", nodeName), ["--version"], {
    encoding: "utf8",
  }).trim()
  step(`bundled Node runs: ${version}`)
} catch (error) {
  fail(`the bundled Node runtime will not execute: ${error.message}`)
}

const size = (dir) => {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      try {
        total += statSync(path.join(entry.parentPath ?? entry.path, entry.name)).size
      } catch {
        // A symlink whose target did not come along; not worth failing over.
      }
    }
  }
  return total
}

console.log(`\n  Bundle ready: ${(size(dist) / 1e6).toFixed(0)} MB at ${path.relative(repo, dist)}\n`)
