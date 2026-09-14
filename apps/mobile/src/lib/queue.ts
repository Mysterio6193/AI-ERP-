/**
 * The offline action queue.
 *
 * A driver marks a delivery complete in a basement loading dock with no signal.
 * That tap has to survive: the app closing, the phone dying, the drive to the
 * next stop. Everything a driver does is therefore recorded here first and sent
 * later, rather than being an HTTP call that either works or is lost.
 *
 * This is the part of a field app that actually loses work, so it is pure and
 * has no React Native imports — persistence is an interface, the clock is an
 * argument, and every branch is testable without a simulator.
 *
 * Four decisions shape it:
 *
 *   - Order is preserved per stop. "Arrived" then "delivered" replayed the
 *     other way round would move a delivery backwards.
 *   - Each action carries a client-generated id, sent as an idempotency key.
 *     A reply lost on a flaky connection otherwise becomes a double-delivery
 *     when the retry lands.
 *   - Retries back off, and a failure that will never succeed is separated
 *     from one that might. Retrying a 422 forever burns battery and hides the
 *     real problem behind a queue that never drains.
 *   - Nothing is dropped silently. An action that exhausts its retries is
 *     parked as `failed` and stays visible, because a delivery that never
 *     reached the office is something a person has to know about.
 */

export type ActionKind =
  | "stop.arrived"
  | "stop.delivered"
  | "stop.exception"
  | "stop.note"

export interface QueuedAction {
  /** Client-generated, and the idempotency key the server sees. */
  id: string
  kind: ActionKind
  /** Groups actions that must stay in order relative to each other. */
  stopId: string
  payload: Record<string, unknown>
  createdAt: number
  attempts: number
  /** When the next attempt becomes due. */
  nextAttemptAt: number
  status: "pending" | "sending" | "failed"
  lastError?: string
}

export interface QueueStorage {
  load(): Promise<QueuedAction[]>
  save(actions: QueuedAction[]): Promise<void>
}

export interface SendResult {
  ok: boolean
  /** HTTP status, when there was one. Absent means the request never left. */
  status?: number
  error?: string
}

export type Sender = (action: QueuedAction) => Promise<SendResult>

export interface QueuePolicy {
  maxAttempts: number
  /** First retry delay in ms; doubles each attempt up to maxBackoffMs. */
  baseBackoffMs: number
  maxBackoffMs: number
}

export const DEFAULT_POLICY: QueuePolicy = {
  maxAttempts: 8,
  baseBackoffMs: 2_000,
  maxBackoffMs: 5 * 60_000,
}

/**
 * Whether a failure is worth trying again.
 *
 * No status at all means the request never left the phone — the usual case in
 * a dead spot, and always worth retrying. A 4xx means the server understood
 * and refused; repeating it will not change the answer. 408 and 429 are the
 * exceptions: both explicitly mean "try again".
 */
export function isRetryable(result: SendResult): boolean {
  if (result.ok) return false
  if (result.status === undefined) return true
  if (result.status === 408 || result.status === 429) return true
  if (result.status >= 500) return true
  return false
}

export function backoffFor(attempts: number, policy: QueuePolicy): number {
  const delay = policy.baseBackoffMs * 2 ** Math.max(attempts - 1, 0)
  return Math.min(delay, policy.maxBackoffMs)
}

export class ActionQueue {
  private actions: QueuedAction[] = []
  private loaded = false

  constructor(
    private storage: QueueStorage,
    private sender: Sender,
    private policy: QueuePolicy = DEFAULT_POLICY
  ) {}

  async load() {
    if (this.loaded) return
    this.actions = await this.storage.load()
    // Anything left mid-send when the app was killed is pending again, not
    // stuck: "sending" is a runtime state, never a durable one.
    for (const action of this.actions) {
      if (action.status === "sending") {
        action.status = "pending"
      }
    }
    this.loaded = true
  }

  /** Everything still queued, oldest first. */
  list(): QueuedAction[] {
    return [...this.actions].sort((a, b) => a.createdAt - b.createdAt)
  }

  pendingCount() {
    return this.actions.filter((action) => action.status !== "failed").length
  }

  failed(): QueuedAction[] {
    return this.actions.filter((action) => action.status === "failed")
  }

  async enqueue(
    input: { id: string; kind: ActionKind; stopId: string; payload: Record<string, unknown> },
    now = Date.now()
  ): Promise<QueuedAction> {
    await this.load()

    // The same id twice is the same action — a double tap, or a screen
    // remounting. Returning the existing one keeps enqueue safe to call freely.
    const existing = this.actions.find((action) => action.id === input.id)
    if (existing) return existing

    const action: QueuedAction = {
      ...input,
      createdAt: now,
      attempts: 0,
      nextAttemptAt: now,
      status: "pending",
    }

    this.actions.push(action)
    await this.storage.save(this.actions)
    return action
  }

  /**
   * Sends what is due.
   *
   * Stops are independent, but within one stop the order is the order it
   * happened, so a blocked action holds back only its own stop. One slow
   * delivery must not stall every other drop on the run.
   */
  async flush(now = Date.now()): Promise<{ sent: number; failed: number; skipped: number }> {
    await this.load()

    let sent = 0
    let failed = 0
    let skipped = 0

    const blockedStops = new Set<string>()

    for (const action of this.list()) {
      if (action.status === "failed") continue

      if (blockedStops.has(action.stopId)) {
        skipped++
        continue
      }

      if (action.nextAttemptAt > now) {
        // Not due yet. Later actions for the same stop must wait too.
        blockedStops.add(action.stopId)
        skipped++
        continue
      }

      action.status = "sending"
      const result = await this.sender(action)

      if (result.ok) {
        this.actions = this.actions.filter((item) => item.id !== action.id)
        sent++
        continue
      }

      action.attempts++
      action.lastError = result.error ?? `HTTP ${result.status ?? "?"}`

      if (!isRetryable(result) || action.attempts >= this.policy.maxAttempts) {
        // Parked, not deleted. Someone has to know this never arrived.
        action.status = "failed"
        failed++
      } else {
        action.status = "pending"
        action.nextAttemptAt = now + backoffFor(action.attempts, this.policy)
      }

      blockedStops.add(action.stopId)
    }

    await this.storage.save(this.actions)
    return { sent, failed, skipped }
  }

  /** Puts a parked action back in the queue, after a person has looked at it. */
  async retryFailed(id: string, now = Date.now()) {
    await this.load()
    const action = this.actions.find((item) => item.id === id)

    if (!action || action.status !== "failed") return false

    action.status = "pending"
    action.attempts = 0
    action.nextAttemptAt = now
    action.lastError = undefined
    await this.storage.save(this.actions)
    return true
  }

  /** Discards an action a person has decided is no longer wanted. */
  async discard(id: string) {
    await this.load()
    const before = this.actions.length
    this.actions = this.actions.filter((item) => item.id !== id)

    if (this.actions.length !== before) {
      await this.storage.save(this.actions)
      return true
    }

    return false
  }
}
