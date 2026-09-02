import Link from "next/link"
import { ArrowUpRight, Bot, Building2 } from "lucide-react"

import { OpenbotStatus } from "@/components/openbot-status"
import { OPENBOT_URL } from "@/lib/openbot"

/**
 * The landing page is a launcher, not a dashboard.
 *
 * Two modules run here: the ERP itself, which lives in this Next.js app, and
 * OpenBot, which is the submodule at `apps/openbot` with its own Docker
 * Compose, PostgreSQL and UI server. They cannot share a process, so this page
 * sends you to whichever one you actually want.
 */

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] px-6 py-16 md:py-24">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-10 md:mb-14">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-black">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-neutral-900 md:text-[40px]">
            SupplySure OS
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-neutral-500">
            Two modules live here. Pick the one you need.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <LauncherCard
            href="/erp"
            icon={<Building2 className="h-5 w-5" />}
            title="ERP"
            tagline="The distribution operating system"
            description="Orders, inventory, invoices, production, routes and the customers behind them. This is the app you sign in to every day."
            action="Open the ERP"
          />

          <LauncherCard
            href={OPENBOT_URL}
            external
            icon={<Bot className="h-5 w-5" />}
            title="OpenBot"
            tagline="AI coworkers with a computer of their own"
            description="A separate stack in apps/openbot: each bot gets its own browser, files and tools, with every action decided before it happens and recorded after."
            action="Open OpenBot"
            status={<OpenbotStatus />}
          />
        </div>

        {/*
          OpenBot has its own Docker Compose and its own PostgreSQL, so the card
          above links to a port nobody has started yet on a fresh machine. Say
          how to start it, rather than leaving a link that fails silently.
        */}
        <section className="mt-10 rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
            Starting OpenBot
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-neutral-600">
            OpenBot does not start with the ERP. It needs Docker running, Bun, and three
            credentials of its own: a CopilotKit Intelligence key, a licence token, and a model key.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-neutral-950 px-4 py-3.5 text-[12.5px] leading-relaxed text-neutral-100">
            <code>{`npm run openbot:init                          # fetch the submodule

# these sign in as you, so run them yourself
npx --yes copilotkit@latest login
npx --yes copilotkit@latest project select    # prints the cpk-... key
npx --yes copilotkit@latest license --write

# put the cpk-... key and your model key in apps/openbot/.env,
# then start everything
npm run openbot:start`}</code>
          </pre>
          <p className="mt-3 text-[13px] leading-relaxed text-neutral-500">
            It serves the UI on <code className="text-neutral-700">{OPENBOT_URL}</code>. Set{" "}
            <code className="text-neutral-700">OPENBOT_URL</code> in this app&apos;s{" "}
            <code className="text-neutral-700">.env</code> if you run it somewhere else. The port
            table and the rest of the setup are in the README.
          </p>
        </section>
      </div>
    </div>
  )
}

interface LauncherCardProps {
  href: string
  icon: React.ReactNode
  title: string
  tagline: string
  description: string
  action: string
  external?: boolean
  status?: React.ReactNode
}

function LauncherCard({
  href,
  icon,
  title,
  tagline,
  description,
  action,
  external = false,
  status,
}: LauncherCardProps) {
  const body = (
    <>
      <div className="mb-5 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-900 transition-colors group-hover:bg-black group-hover:text-white">
          {icon}
        </div>
        {status}
      </div>
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-neutral-900">{title}</h2>
      <p className="mt-0.5 text-[13px] text-neutral-500">{tagline}</p>
      <p className="mt-3 flex-1 text-[14px] leading-relaxed text-neutral-600">{description}</p>
      <span className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-neutral-900">
        {action}
        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
    </>
  )

  const className =
    "group flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-6 transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]"

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {body}
      </a>
    )
  }

  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  )
}
