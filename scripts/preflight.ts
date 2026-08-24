/**
 * Production preflight.
 *
 * Answers one question: would this deployment work if it went live right now.
 * Every check here corresponds to something that has actually failed silently
 * in this codebase — a secret falling back to a published literal, a mail
 * transport that records messages as sent and delivers nothing, a webhook that
 * refuses traffic because its secret is missing.
 *
 *   bun scripts/preflight.ts
 */
import { execSync } from "node:child_process"
import { existsSync } from "node:fs"

import { checkEnvironment } from "../src/lib/env-guard"
import { db } from "../src/lib/db"
import { looksLikeFillerText, looksLikePlaceholder } from "../src/lib/placeholder-detect"

type Level = "fatal" | "warn" | "ok"
const rows: Array<{ level: Level; area: string; message: string }> = []

function add(level: Level, area: string, message: string) {
  rows.push({ level, area, message })
}

function run(command: string) {
  try {
    return { ok: true, out: execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string }
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }
  }
}

async function main() {
  console.log("Production preflight\n")

  // --- Environment, judged as if NODE_ENV were production -------------------
  const issues = checkEnvironment({ ...process.env, NODE_ENV: "production" } as never)

  for (const issue of issues) {
    add(issue.level === "fatal" ? "fatal" : "warn", issue.key, issue.message)
  }

  if (issues.length === 0) {
    add("ok", "environment", "Every required variable is set.")
  }

  // --- The database the app would actually talk to --------------------------
  try {
    await db.$queryRawUnsafe("SELECT 1")
    add("ok", "database", "Reachable.")

    const pending = run("npx prisma migrate status")
    if (/have not yet been applied|not yet been applied/i.test(pending.out)) {
      add("fatal", "migrations", "Migrations are pending. Deploying now would run against an older schema.")
    } else {
      add("ok", "migrations", "Schema is up to date.")
    }
  } catch (error) {
    add("fatal", "database", `Unreachable: ${(error as Error).message.slice(0, 90)}`)
  }

  // --- Every company needs books, and somewhere to be paid ------------------
  const companies = await db.company.findMany({
    select: {
      id: true, name: true,
      bankName: true, bsb: true, accountNumber: true, accountName: true,
      upiId: true, ifscCode: true, abn: true, address: true,
    },
  })

  for (const company of companies) {
    const accounts = await db.chartOfAccount.count({ where: { companyId: company.id } })
    if (accounts === 0) {
      // Seeded lazily on first posting, so this is a warning rather than a
      // blocker — but it means that company has never transacted.
      add("warn", "accounting", `${company.name} has no chart of accounts yet.`)
    }

    // An invoice from an entity with no payment details tells the customer to
    // quote a reference and never says where to send the money.
    const payable = Boolean(
      company.bankName || company.bsb || company.accountNumber || company.upiId || company.ifscCode
    )

    if (!payable) {
      add("fatal", "invoicing", `${company.name} has no bank details, so its invoices cannot be paid.`)
    } else {
      // Filled-in but invented details are worse than empty ones: absence is
      // caught by the check above, while a fabricated account number reaches a
      // customer looking exactly like a real one.
      for (const [label, value] of [
        ["BSB", company.bsb],
        ["account number", company.accountNumber],
      ] as const) {
        const check = looksLikePlaceholder(value)
        if (check.suspicious) {
          add(
            "fatal",
            "invoicing",
            `${company.name}'s ${label} (${value}) looks like placeholder data — ${check.reason}. Confirm it before any invoice goes out.`
          )
        }
      }

      if (looksLikeFillerText(company.accountName) || looksLikeFillerText(company.bankName)) {
        add("fatal", "invoicing", `${company.name}'s bank or account name looks like filler text.`)
      }
    }

    if (payable && !company.accountName) {
      add("warn", "invoicing", `${company.name} has no account name on its remittance details.`)
    }

    if (!company.abn) {
      add("warn", "compliance", `${company.name} has no ABN, which a tax invoice requires.`)
    }

    if (!company.address) {
      add("warn", "compliance", `${company.name} has no address on its documents.`)
    }
  }

  // --- Data shapes that have already caused failures ------------------------
  const orphanCustomers = await db.customer.count({ where: { companyId: null } })
  if (orphanCustomers > 0) {
    add(
      "warn",
      "multi-entity",
      `${orphanCustomers} customer(s) belong to no company, so their orders and invoices inherit none.`
    )
  }

  // --- Build ---------------------------------------------------------------
  add(
    existsSync(".next") ? "ok" : "warn",
    "build",
    existsSync(".next") ? "A build exists." : "No .next build found. Run the build before deploying."
  )

  // --- Report ---------------------------------------------------------------
  const order: Level[] = ["fatal", "warn", "ok"]
  const label = { fatal: "BLOCK", warn: "WARN ", ok: "ok   " }

  for (const level of order) {
    for (const row of rows.filter((r) => r.level === level)) {
      console.log(`  ${label[row.level]}  ${row.area.padEnd(22)} ${row.message}`)
    }
  }

  const blockers = rows.filter((r) => r.level === "fatal").length
  const warnings = rows.filter((r) => r.level === "warn").length

  console.log(
    `\n${blockers === 0 ? "READY" : "NOT READY"} — ${blockers} blocker(s), ${warnings} warning(s)`
  )

  await db.$disconnect()
  process.exit(blockers === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await db.$disconnect()
  process.exit(1)
})
