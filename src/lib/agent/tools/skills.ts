import { z } from "zod"

import type { AgentPrincipal } from "../context"
import { createSkill, improveSkill, listSkills, readSkill, recordSkillOutcome } from "../skills"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * The learning loop.
 *
 * `readSkill` before doing something it has done before, `createSkill` after
 * working out something non-obvious, `improveSkill` when the steps turn out to
 * be wrong. The descriptions carry the judgement about *when* — the failure
 * mode is writing a skill for every trivial request, which buries the few
 * procedures that actually encode how this business works.
 */

export function buildSkillTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    readSkill: defineTool({
      description:
        "Read the steps of a procedure you worked out before. Do this BEFORE starting any task that appears in your procedures list — the steps exist because working them out the first time was not obvious.",
      inputSchema: z.object({
        slug: z.string().describe("The slug from your procedures list"),
      }),
      execute: async ({ slug }) => {
        const result = await readSkill(slug)

        if (!result.ok) {
          return { found: false as const, error: result.error }
        }

        return { found: true as const, ...result.skill }
      },
    }),

    createSkill: defineTool({
      description:
        "Write down a procedure you just worked out, so it does not have to be rediscovered. Do this after a task that took several steps and involved a judgement someone would otherwise have to repeat. Do NOT write one for a single tool call or a one-off question. Steps should be specific to this business, not generic advice.",
      inputSchema: z.object({
        name: z.string().describe("Short name, e.g. 'Month-end stock reconciliation'"),
        description: z
          .string()
          .describe(
            "When to use this, in one sentence. This is all you will see when choosing later, so describe the trigger, not the steps."
          ),
        content: z
          .string()
          .describe("The steps, in markdown. Include the specific tools, thresholds and gotchas."),
        tools: z
          .array(z.string())
          .optional()
          .describe("Tool names the steps rely on, so it is only offered when they are available"),
        category: z.enum(["process", "checklist", "analysis", "recovery"]).optional(),
      }),
      execute: async (input) => {
        const result = await createSkill({
          ...input,
          createdById: principal.userId,
          createdByAgent: true,
        })

        if (!result.ok) {
          return { ok: false as const, error: result.error }
        }

        return {
          ok: true as const,
          slug: result.skill.slug,
          name: result.skill.name,
          note: "Saved. Read it back with readSkill next time this comes up.",
        }
      },
    }),

    improveSkill: defineTool({
      description:
        "Correct a procedure whose steps turned out to be wrong or incomplete. Use this the moment a skill misleads you — leaving it wrong means the next run repeats the same mistake. Supply the full corrected steps, not a diff.",
      inputSchema: z.object({
        slug: z.string(),
        content: z.string().describe("The complete corrected steps"),
        changeNote: z.string().optional().describe("What was wrong, briefly"),
      }),
      execute: async (input) => {
        const result = await improveSkill(input)

        if (!result.ok) {
          return { ok: false as const, error: result.error }
        }

        return {
          ok: true as const,
          slug: result.skill.slug,
          version: result.skill.version,
          previousVersion: result.previousVersion,
        }
      },
    }),

    recordSkillOutcome: defineTool({
      description:
        "Say whether a procedure you followed actually worked. Be honest about failures — a procedure that keeps failing needs revising, and that is only visible if it is recorded.",
      inputSchema: z.object({
        slug: z.string(),
        worked: z.boolean(),
      }),
      execute: async ({ slug, worked }) => {
        const result = await recordSkillOutcome(slug, worked)
        return result.ok ? { ok: true as const, successRate: result.successRate } : { ok: false as const, error: result.error }
      },
    }),

    listSkills: defineTool({
      description: "Every procedure you know, with how often each has worked.",
      inputSchema: z.object({}),
      execute: async () => {
        const skills = await listSkills()

        return {
          count: skills.length,
          skills: skills.map((skill) => ({
            slug: skill.slug,
            name: skill.name,
            description: skill.description,
            version: skill.version,
            useCount: skill.useCount,
            successRate: skill.successRate,
          })),
        }
      },
    }),
  }
}
