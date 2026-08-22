import { z } from "zod"

import { db } from "@/lib/db"
import { describeSettingsDiff, diffSettings } from "@/lib/settings/diff"
import { isNamespace, listNamespaces, REGISTRY, type Namespace } from "@/lib/settings/registry"
import { getSettings, resetSettings, saveSettings } from "@/lib/settings/service"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * Letting the agent change how the business works.
 *
 * This is the most dangerous tool group in the system: one accepted change here
 * moves every tax figure, due date or price the platform produces. Four things
 * stand between the agent and that, and none of them live in policy metadata
 * alone — metadata is a table someone can edit, so the guards are in the bodies
 * below where they cannot be configured away:
 *
 *   1. The agent can never touch its own limits. `agent.` is refused outright.
 *   2. Admin staff only. A customer session gets no settings tools at all.
 *   3. Changes are validated before the approval card is drawn, so a human is
 *      always approving something that will actually apply.
 *   4. Writes are off until someone turns them on in the UI.
 *
 * The approval gate itself is inherited: `alwaysApprove` in TOOL_POLICY means
 * the run pauses before execute is ever reached.
 */

/** Setting keys the agent must never be able to reach, whoever approves it. */
const FORBIDDEN_PREFIXES = ["agent.", "agent_"]

const WRITES_ENABLED_KEY = "agent.allowSettingWrites"

/**
 * Whether the agent may propose settings changes at all.
 *
 * Deliberately stored under `agent.` — the namespace the agent is forbidden
 * from writing — so it cannot turn its own writes on.
 */
export async function agentSettingWritesEnabled() {
  try {
    const row = await db.setting.findUnique({ where: { key: WRITES_ENABLED_KEY } })
    return row ? JSON.parse(row.value) === true : false
  } catch {
    // A corrupt flag means off. The safe reading of "unknown" is "not allowed".
    return false
  }
}

/**
 * Guard 1, in the tool body rather than in policy metadata.
 *
 * The agent must never raise its own ceiling — not even with a human tapping
 * Approve on a card they skimmed. `agent.thresholds`, `agent.identity` and
 * `agent.allowSettingWrites` all live under this prefix.
 */
function isForbidden(namespace: string) {
  const lower = namespace.toLowerCase()
  return FORBIDDEN_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

function refuse(reason: string) {
  return { ok: false as const, error: reason }
}

export function buildSettingsTools(principal: AgentPrincipal) {
  // Guard 2. Customers and non-admin staff get nothing — not a refusing tool,
  // no tool at all, which also keeps them out of a local model's prompt.
  if (!isStaff(principal) || principal.role !== "admin") {
    return {}
  }

  return {
    listSettings: defineTool({
      description:
        "List the configurable areas of the business - tax, invoicing, receivables aging, document numbering, pricing, operations - and what each controls. Start here before reading or changing any setting.",
      inputSchema: z.object({}),
      execute: async () => ({
        ok: true as const,
        namespaces: listNamespaces().map((entry) => ({
          namespace: entry.namespace,
          label: entry.label,
          description: entry.description,
        })),
      }),
    }),

    getSetting: defineTool({
      description:
        "Read the current values for one settings area. Always read before proposing a change, so you know what it is now and can say what would actually differ.",
      inputSchema: z.object({
        namespace: z
          .string()
          .describe("One of the namespaces from listSettings, e.g. 'tax' or 'numbering'"),
      }),
      execute: async ({ namespace }) => {
        if (isForbidden(namespace) || !isNamespace(namespace)) {
          return refuse(`There is no settings area called "${namespace}".`)
        }

        return {
          ok: true as const,
          namespace,
          label: REGISTRY[namespace].label,
          settings: await getSettings(namespace),
        }
      },
    }),

    proposeSettingChange: defineTool({
      description:
        "Change how the business works - a tax rate, invoice due dates, aging buckets, document number formats, pricing rules. This always goes to a person for approval, and they see exactly which values would change. Read the area with getSetting first and change only the fields you mean to.",
      inputSchema: z.object({
        namespace: z.string().describe("The settings area, e.g. 'tax'"),
        changes: z
          .record(z.string(), z.any())
          .describe(
            "Only the fields to change, e.g. { defaultRate: 15 }. Fields left out keep their current values."
          ),
        reason: z
          .string()
          .describe("Why this change is being made, in one sentence, for the audit trail."),
      }),
      execute: async ({ namespace, changes, reason }) => {
        // Guards run again here, not only at proposal time: execute is reached
        // after a human approves, and the arguments are the model's.
        if (isForbidden(namespace)) {
          return refuse(
            "The agent's own limits and identity cannot be changed by the agent. Ask an admin to change them on the agent settings page."
          )
        }

        if (!isNamespace(namespace)) {
          return refuse(`There is no settings area called "${namespace}".`)
        }

        if (!(await agentSettingWritesEnabled())) {
          return refuse(
            "Settings changes by the agent are switched off. An admin can enable them on the agent settings page."
          )
        }

        const result = await saveSettings(namespace as Namespace, changes, {
          reason,
          // Attributed to the approving admin, not to the agent.
          actorId: principal.kind === "staff" ? principal.userId : null,
        })

        if (!result.ok) {
          return refuse(result.error ?? "The change was rejected as invalid.")
        }

        return { ok: true as const, namespace, settings: result.settings, reason }
      },
    }),

    resetSetting: defineTool({
      description:
        "Put one settings area back to its shipped defaults. Also needs approval. Use when a change has made things worse and the original behaviour is wanted back.",
      inputSchema: z.object({
        namespace: z.string().describe("The settings area to reset"),
      }),
      execute: async ({ namespace }) => {
        if (isForbidden(namespace)) {
          return refuse("The agent's own limits and identity cannot be reset by the agent.")
        }

        if (!isNamespace(namespace)) {
          return refuse(`There is no settings area called "${namespace}".`)
        }

        if (!(await agentSettingWritesEnabled())) {
          return refuse("Settings changes by the agent are switched off.")
        }

        await resetSettings(namespace as Namespace)

        return { ok: true as const, namespace, settings: await getSettings(namespace) }
      },
    }),
  }
}

/**
 * Guard 3 and 4: what the approval card says.
 *
 * Computed against the values saved right now, so the person approving sees
 * "tax: defaultRate: not set → 15%" rather than a JSON blob. If the change
 * would not validate, the card says so — approving something that will be
 * rejected on execute wastes a human decision.
 */
export async function describeSettingProposal(args: Record<string, unknown>) {
  const namespace = String(args.namespace ?? "")
  const changes = (args.changes ?? {}) as Record<string, unknown>

  if (isForbidden(namespace)) {
    return `REFUSED: the agent cannot change its own settings (${namespace})`
  }

  if (!isNamespace(namespace)) {
    return `Change unknown settings area "${namespace}" (this will be refused)`
  }

  try {
    const current = (await getSettings(namespace)) as Record<string, unknown>
    const diff = diffSettings(current, changes)

    const merged = { ...current, ...changes }
    const parsed = REGISTRY[namespace].schema.safeParse(merged)

    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return `Change ${namespace} settings — INVALID: ${first?.path.join(".") || "value"}: ${first?.message}`
    }

    return describeSettingsDiff(namespace, diff)
  } catch {
    return `Change ${namespace} settings`
  }
}
