import { db } from "@/lib/db"

import {
  defaultsFor,
  REGISTRY,
  type Namespace,
  type SettingsOf,
} from "./registry"

/**
 * Reading and writing business settings.
 *
 * Stored in the existing `Setting` key/value table rather than a new one.
 * Adding a composite unique on (key, companyId) would force a SQLite table
 * rebuild and break the three `findUnique({ where: { key } })` calls the agent
 * layer already makes, so **scope is encoded in the key** instead:
 *
 *   "tax"                    global default
 *   "co:<companyId>:tax"     per-entity override
 *
 * Reads walk company → global → compiled-in default. The group bills from
 * several companies, so a per-entity GST rate or numbering prefix is a real
 * requirement, not a hypothetical one.
 *
 * Every read is wrapped so a malformed or half-written row degrades to defaults
 * rather than taking a page down. That is what makes "nothing breaks when
 * unset" true rather than aspirational.
 */

const CACHE_TTL_MS = 5_000

interface CacheEntry {
  value: unknown
  expires: number
}

// Per-process, deliberately. `resolveLineTaxRate` and `resolveLinePrice` are
// called once per order line, so an uncached read would be a query per line.
// Single-node deployment, so there is no cross-process coherence problem.
const cache = new Map<string, CacheEntry>()

function keyFor(namespace: Namespace, companyId?: string | null) {
  return companyId ? `co:${companyId}:${namespace}` : namespace
}

function invalidate(namespace: Namespace, companyId?: string | null) {
  cache.delete(keyFor(namespace, companyId))
  // A global change can alter what a company-scoped read resolves to, so drop
  // every entry for the namespace rather than reasoning about which.
  for (const key of cache.keys()) {
    if (key.endsWith(`:${namespace}`)) {
      cache.delete(key)
    }
  }
}

async function readRow(key: string) {
  try {
    const row = await db.setting.findUnique({ where: { key }, select: { value: true } })
    return row ? (JSON.parse(row.value) as unknown) : null
  } catch {
    // Malformed JSON in one row must not break the caller.
    return null
  }
}

/**
 * Resolves a namespace for the given company.
 *
 * Company values are merged **over** global ones rather than replacing them, so
 * an entity can override a single field without restating the whole namespace.
 */
export async function getSettings<K extends Namespace>(
  namespace: K,
  options?: { companyId?: string | null; skipCache?: boolean }
): Promise<SettingsOf<K>> {
  const companyId = options?.companyId ?? null
  const cacheKey = keyFor(namespace, companyId)

  if (!options?.skipCache) {
    const hit = cache.get(cacheKey)
    if (hit && hit.expires > Date.now()) {
      return hit.value as SettingsOf<K>
    }
  }

  const schema = REGISTRY[namespace].schema

  const [globalValue, companyValue] = await Promise.all([
    readRow(namespace),
    companyId ? readRow(keyFor(namespace, companyId)) : Promise.resolve(null),
  ])

  const merged = {
    ...(globalValue && typeof globalValue === "object" ? globalValue : {}),
    ...(companyValue && typeof companyValue === "object" ? companyValue : {}),
  }

  const parsed = schema.safeParse(merged)

  if (!parsed.success) {
    // Log once and carry on with defaults. A stored value that no longer
    // matches the schema is a deployment problem, not a request failure.
    console.error(`Settings "${namespace}" failed validation, using defaults:`, parsed.error.issues)
    const fallback = defaultsFor(namespace)
    cache.set(cacheKey, { value: fallback, expires: Date.now() + CACHE_TTL_MS })
    return fallback
  }

  cache.set(cacheKey, { value: parsed.data, expires: Date.now() + CACHE_TTL_MS })
  return parsed.data as SettingsOf<K>
}

export interface SaveResult<K extends Namespace> {
  ok: boolean
  error?: string
  settings?: SettingsOf<K>
}

/**
 * Merges a patch over the current value and stores it.
 *
 * Validates the **merged** result, not the patch, so a partial update cannot
 * leave the namespace in a state the schema would reject.
 */
export async function saveSettings<K extends Namespace>(
  namespace: K,
  patch: Record<string, unknown>,
  options?: { companyId?: string | null; actorId?: string | null; reason?: string }
): Promise<SaveResult<K>> {
  const companyId = options?.companyId ?? null
  const key = keyFor(namespace, companyId)
  const schema = REGISTRY[namespace].schema

  const current = await getSettings(namespace, { companyId, skipCache: true })
  const merged = { ...(current as Record<string, unknown>), ...patch }

  const parsed = schema.safeParse(merged)

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first ? `${first.path.join(".") || "value"}: ${first.message}` : "Invalid settings",
    }
  }

  const previous = await readRow(key)

  await db.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(parsed.data), category: "business" },
    update: { value: JSON.stringify(parsed.data) },
  })

  // Configuration changes are the kind of thing someone needs to reconstruct
  // months later — "who changed the GST rate in September".
  await db.auditLog.create({
    data: {
      entityType: "setting",
      entityId: key,
      action: previous ? "update" : "create",
      userId: options?.actorId || null,
      oldValues: previous ? JSON.stringify(previous) : null,
      newValues: JSON.stringify(parsed.data),
    },
  })

  invalidate(namespace, companyId)

  return { ok: true, settings: parsed.data as SettingsOf<K> }
}

/** Removes the stored row so the namespace falls back to global, then defaults. */
export async function resetSettings<K extends Namespace>(
  namespace: K,
  options?: { companyId?: string | null; actorId?: string | null }
): Promise<SettingsOf<K>> {
  const companyId = options?.companyId ?? null
  const key = keyFor(namespace, companyId)
  const previous = await readRow(key)

  await db.setting.deleteMany({ where: { key } })

  if (previous) {
    await db.auditLog.create({
      data: {
        entityType: "setting",
        entityId: key,
        action: "delete",
        userId: options?.actorId || null,
        oldValues: JSON.stringify(previous),
      },
    })
  }

  invalidate(namespace, companyId)

  return getSettings(namespace, { companyId, skipCache: true })
}

/** Whether this namespace has been customised, for the "using defaults" hint. */
export async function isCustomised(namespace: Namespace, companyId?: string | null) {
  const [globalRow, companyRow] = await Promise.all([
    readRow(namespace),
    companyId ? readRow(keyFor(namespace, companyId)) : Promise.resolve(null),
  ])

  return { global: globalRow !== null, company: companyRow !== null }
}

/** Testing seam: the cache is per-process and would otherwise leak between cases. */
export function clearSettingsCache() {
  cache.clear()
}
