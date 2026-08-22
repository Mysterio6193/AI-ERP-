import { db } from "@/lib/db"

import { TOOL_POLICY } from "./tools"

/**
 * Procedural memory.
 *
 * Facts tell the agent what is true; a skill tells it how this business does
 * something. The agent writes them from experience and revises them when a run
 * shows the steps were wrong, which is the loop that makes it better at work it
 * has done before rather than merely faster at looking things up.
 *
 * Two rules keep the set useful rather than sprawling:
 *
 *   - Skills are *selected*, not injected. Only the name and description of
 *     each are put in front of the model; the body is read on demand. A dozen
 *     full procedures in every prompt would crowd out the actual conversation.
 *   - Outcomes are counted. A procedure that keeps failing is visible, and
 *     visible is the precondition for fixing it.
 */

export interface SkillSummary {
  id: string
  slug: string
  name: string
  description: string
  category: string
  version: number
  useCount: number
  successRate: number | null
  tools: string[]
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

function parseTools(json: string | null): string[] {
  if (!json) {
    return []
  }

  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === "string") : []
  } catch {
    return []
  }
}

function successRate(skill: { successCount: number; failureCount: number }) {
  const total = skill.successCount + skill.failureCount
  return total > 0 ? Math.round((skill.successCount / total) * 100) : null
}

/**
 * The skills on offer for a turn.
 *
 * Filtered to what the current agent can actually carry out: a procedure that
 * calls `recordPayment` is useless to an agent without that tool, and offering
 * it produces a confident attempt that dead-ends.
 */
export async function availableSkills(availableToolNames?: string[] | null): Promise<SkillSummary[]> {
  const skills = await db.agentSkill.findMany({
    where: { status: "active" },
    orderBy: [{ useCount: "desc" }, { updatedAt: "desc" }],
    take: 40,
  })

  const permitted = availableToolNames ? new Set(availableToolNames) : null

  return skills
    .filter((skill) => {
      if (!permitted) {
        return true
      }

      const required = parseTools(skill.toolsJson)
      return required.every((tool) => permitted.has(tool))
    })
    .map((skill) => ({
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      version: skill.version,
      useCount: skill.useCount,
      successRate: successRate(skill),
      tools: parseTools(skill.toolsJson),
    }))
}

/** Renders the catalogue for the prompt. Names and triggers only, never bodies. */
export function formatSkillCatalogue(skills: SkillSummary[]) {
  if (!skills.length) {
    return ""
  }

  const lines = skills.map((skill) => {
    const reliability =
      skill.successRate !== null && skill.useCount >= 3
        ? ` (used ${skill.useCount}×, ${skill.successRate}% worked)`
        : ""

    return `- ${skill.slug}: ${skill.description}${reliability}`
  })

  return [
    "--- procedures you have worked out before ---",
    ...lines,
    "Call readSkill with the slug before doing any of these, and follow the steps. If the steps turn out to be wrong, fix them with improveSkill afterwards.",
  ].join("\n")
}

export async function readSkill(slug: string) {
  const skill = await db.agentSkill.findFirst({
    where: { OR: [{ slug }, { id: slug }], status: { not: "archived" } },
  })

  if (!skill) {
    return { ok: false as const, error: `No skill named "${slug}"` }
  }

  await db.agentSkill.update({
    where: { id: skill.id },
    data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
  })

  return {
    ok: true as const,
    skill: {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      content: skill.content,
      version: skill.version,
      tools: parseTools(skill.toolsJson),
    },
  }
}

export async function createSkill(input: {
  name: string
  description: string
  content: string
  tools?: string[]
  category?: string
  runId?: string
  createdById?: string
  createdByAgent?: boolean
  companyId?: string | null
}) {
  const name = input.name.trim()
  const content = input.content.trim()

  if (!name || !content) {
    return { ok: false as const, error: "A skill needs a name and steps" }
  }

  if (!input.description?.trim()) {
    return {
      ok: false as const,
      error: "A skill needs a description saying when to use it, or it will never be selected",
    }
  }

  // Unknown tool names are dropped rather than stored: a skill listing a tool
  // that does not exist would be permanently filtered out of every catalogue.
  const tools = (input.tools || []).filter((tool) => tool in TOOL_POLICY)

  let slug = slugify(name)
  if (!slug) {
    return { ok: false as const, error: "Name must contain letters or numbers" }
  }

  const clash = await db.agentSkill.findUnique({ where: { slug } })
  if (clash) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`
  }

  const skill = await db.agentSkill.create({
    data: {
      slug,
      name,
      description: input.description.trim(),
      content,
      toolsJson: tools.length ? JSON.stringify(tools) : null,
      category: input.category || "process",
      createdFromRunId: input.runId || null,
      createdById: input.createdById || null,
      createdByAgent: input.createdByAgent ?? true,
      companyId: input.companyId || null,
      revisions: {
        create: { version: 1, content, changeNote: "Written from experience" },
      },
    },
  })

  return { ok: true as const, skill }
}

/**
 * Revises a skill, keeping the old version.
 *
 * The whole point of the loop: a procedure that did not survive contact with
 * reality gets corrected by the run that discovered it, not by someone
 * remembering to come back later.
 */
export async function improveSkill(input: {
  slug: string
  content: string
  changeNote?: string
  runId?: string
}) {
  const skill = await db.agentSkill.findFirst({
    where: { OR: [{ slug: input.slug }, { id: input.slug }] },
  })

  if (!skill) {
    return { ok: false as const, error: `No skill named "${input.slug}"` }
  }

  const nextVersion = skill.version + 1

  const updated = await db.agentSkill.update({
    where: { id: skill.id },
    data: {
      content: input.content.trim(),
      version: nextVersion,
      revisions: {
        create: {
          version: nextVersion,
          content: input.content.trim(),
          changeNote: input.changeNote || null,
          runId: input.runId || null,
        },
      },
    },
  })

  return { ok: true as const, skill: updated, previousVersion: skill.version }
}

/** Records how a use went, so an unreliable procedure becomes visible. */
export async function recordSkillOutcome(slug: string, worked: boolean) {
  const skill = await db.agentSkill.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    select: { id: true },
  })

  if (!skill) {
    return { ok: false as const, error: "No such skill" }
  }

  const updated = await db.agentSkill.update({
    where: { id: skill.id },
    data: worked ? { successCount: { increment: 1 } } : { failureCount: { increment: 1 } },
  })

  return { ok: true as const, successRate: successRate(updated) }
}

export async function listSkills(includeArchived = false) {
  const skills = await db.agentSkill.findMany({
    where: includeArchived ? {} : { status: { not: "archived" } },
    orderBy: [{ useCount: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { revisions: true } } },
  })

  return skills.map((skill) => ({
    ...skill,
    tools: parseTools(skill.toolsJson),
    successRate: successRate(skill),
  }))
}
