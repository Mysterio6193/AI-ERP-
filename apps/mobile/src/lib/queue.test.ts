import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ActionQueue,
  backoffFor,
  DEFAULT_POLICY,
  isRetryable,
  type QueuedAction,
  type QueueStorage,
  type SendResult,
} from "./queue"

/** Stands in for SecureStore/AsyncStorage, and survives between instances. */
function memoryStorage(initial: QueuedAction[] = []) {
  let rows = [...initial]
  const storage: QueueStorage & { rows: () => QueuedAction[] } = {
    load: async () => rows.map((row) => ({ ...row })),
    save: async (actions) => {
      rows = actions.map((action) => ({ ...action }))
    },
    rows: () => rows,
  }
  return storage
}

const T0 = 1_000_000

function action(id: string, stopId = "stop-1", kind: QueuedAction["kind"] = "stop.delivered") {
  return { id, kind, stopId, payload: { at: id } }
}

describe("isRetryable", () => {
  it("retries a request that never left the phone", () => {
    // The dead-spot case: no status at all.
    expect(isRetryable({ ok: false, error: "Network request failed" })).toBe(true)
  })

  it("does not retry something the server understood and refused", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(isRetryable({ ok: false, status })).toBe(false)
    }
  })

  it("retries the two 4xx that mean 'try again'", () => {
    expect(isRetryable({ ok: false, status: 408 })).toBe(true)
    expect(isRetryable({ ok: false, status: 429 })).toBe(true)
  })

  it("retries server errors", () => {
    expect(isRetryable({ ok: false, status: 500 })).toBe(true)
    expect(isRetryable({ ok: false, status: 503 })).toBe(true)
  })
})

describe("backoffFor", () => {
  it("doubles, then stops growing", () => {
    expect(backoffFor(1, DEFAULT_POLICY)).toBe(2_000)
    expect(backoffFor(2, DEFAULT_POLICY)).toBe(4_000)
    expect(backoffFor(3, DEFAULT_POLICY)).toBe(8_000)
    // Capped, or a phone left overnight waits days for the next attempt.
    expect(backoffFor(50, DEFAULT_POLICY)).toBe(DEFAULT_POLICY.maxBackoffMs)
  })
})

describe("ActionQueue", () => {
  let storage: ReturnType<typeof memoryStorage>

  beforeEach(() => {
    storage = memoryStorage()
  })

  it("keeps work that was done with no signal", async () => {
    const offline = vi.fn(async (): Promise<SendResult> => ({
      ok: false,
      error: "Network request failed",
    }))
    const queue = new ActionQueue(storage, offline, DEFAULT_POLICY)

    await queue.enqueue(action("a1"), T0)
    const result = await queue.flush(T0)

    expect(result.sent).toBe(0)
    // Still queued, and still on disk — this is the whole point.
    expect(queue.pendingCount()).toBe(1)
    expect(storage.rows()).toHaveLength(1)
  })

  it("survives the app being killed mid-send", async () => {
    // A row left as "sending" is a runtime state that never made it, not a
    // durable one; on reload it must be sendable again rather than stuck.
    const stuck = memoryStorage([
      {
        ...action("a1"),
        createdAt: T0,
        attempts: 1,
        nextAttemptAt: T0,
        status: "sending",
      },
    ])

    const send = vi.fn(async (): Promise<SendResult> => ({ ok: true }))
    const queue = new ActionQueue(stuck, send, DEFAULT_POLICY)

    const result = await queue.flush(T0)

    expect(result.sent).toBe(1)
    expect(stuck.rows()).toHaveLength(0)
  })

  it("sends the same action once however many times it is tapped", async () => {
    const send = vi.fn(async (): Promise<SendResult> => ({ ok: true }))
    const queue = new ActionQueue(storage, send, DEFAULT_POLICY)

    // Same id: a double tap, or a screen remounting.
    await queue.enqueue(action("a1"), T0)
    await queue.enqueue(action("a1"), T0 + 5)
    await queue.enqueue(action("a1"), T0 + 9)

    expect(queue.pendingCount()).toBe(1)
    await queue.flush(T0 + 10)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("keeps one stop's actions in the order they happened", async () => {
    const seen: string[] = []
    const send = vi.fn(async (queued: QueuedAction): Promise<SendResult> => {
      seen.push(queued.id)
      return { ok: true }
    })
    const queue = new ActionQueue(storage, send, DEFAULT_POLICY)

    await queue.enqueue({ ...action("arrived", "stop-1", "stop.arrived") }, T0)
    await queue.enqueue({ ...action("delivered", "stop-1", "stop.delivered") }, T0 + 1)

    await queue.flush(T0 + 10)

    // Replayed the other way round, the delivery would move backwards.
    expect(seen).toEqual(["arrived", "delivered"])
  })

  it("does not let one stuck stop hold up the rest of the run", async () => {
    const send = vi.fn(async (queued: QueuedAction): Promise<SendResult> => {
      if (queued.stopId === "stop-1") return { ok: false, status: 503 }
      return { ok: true }
    })
    const queue = new ActionQueue(storage, send, DEFAULT_POLICY)

    await queue.enqueue(action("a1", "stop-1"), T0)
    await queue.enqueue(action("a2", "stop-1"), T0 + 1)
    await queue.enqueue(action("b1", "stop-2"), T0 + 2)
    await queue.enqueue(action("c1", "stop-3"), T0 + 3)

    const result = await queue.flush(T0 + 10)

    // stop-1 blocked (a1 failed, a2 held back to preserve its order), but the
    // other two drops went.
    expect(result.sent).toBe(2)
    expect(result.skipped).toBe(1)
    expect(queue.list().map((item) => item.id).sort()).toEqual(["a1", "a2"])
  })

  it("waits out the backoff rather than hammering a dead connection", async () => {
    const send = vi.fn(async (): Promise<SendResult> => ({ ok: false, status: 500 }))
    const queue = new ActionQueue(storage, send, DEFAULT_POLICY)

    await queue.enqueue(action("a1"), T0)
    await queue.flush(T0)
    expect(send).toHaveBeenCalledTimes(1)

    // Too soon: not attempted again.
    await queue.flush(T0 + 500)
    expect(send).toHaveBeenCalledTimes(1)

    // Past the 2s backoff.
    await queue.flush(T0 + 2_500)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("parks a refusal immediately instead of retrying it forever", async () => {
    const send = vi.fn(async (): Promise<SendResult> => ({
      ok: false,
      status: 422,
      error: "This stop is already delivered",
    }))
    const queue = new ActionQueue(storage, send, DEFAULT_POLICY)

    await queue.enqueue(action("a1"), T0)
    const result = await queue.flush(T0)

    expect(result.failed).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)

    // Later flushes must not keep trying it.
    await queue.flush(T0 + 1_000_000)
    expect(send).toHaveBeenCalledTimes(1)

    // And it is visible, not silently gone: someone has to know this delivery
    // never reached the office.
    expect(queue.failed()).toHaveLength(1)
    expect(queue.failed()[0].lastError).toContain("already delivered")
  })

  it("gives up after the configured attempts, still without discarding", async () => {
    const send = vi.fn(async (): Promise<SendResult> => ({ ok: false, status: 500 }))
    const policy = { maxAttempts: 3, baseBackoffMs: 1_000, maxBackoffMs: 10_000 }
    const queue = new ActionQueue(storage, send, policy)

    await queue.enqueue(action("a1"), T0)

    let now = T0
    for (let i = 0; i < 5; i++) {
      await queue.flush(now)
      now += 100_000
    }

    expect(send).toHaveBeenCalledTimes(3)
    expect(queue.failed()).toHaveLength(1)
    expect(storage.rows()).toHaveLength(1)
  })

  it("lets a person retry or discard something that was parked", async () => {
    let fail = true
    const send = vi.fn(async (): Promise<SendResult> =>
      fail ? { ok: false, status: 422 } : { ok: true }
    )
    const queue = new ActionQueue(storage, send, DEFAULT_POLICY)

    await queue.enqueue(action("a1"), T0)
    await queue.flush(T0)
    expect(queue.failed()).toHaveLength(1)

    fail = false
    expect(await queue.retryFailed("a1", T0 + 10)).toBe(true)
    await queue.flush(T0 + 20)
    expect(queue.list()).toHaveLength(0)

    await queue.enqueue(action("a2"), T0 + 30)
    expect(await queue.discard("a2")).toBe(true)
    expect(queue.list()).toHaveLength(0)
    expect(await queue.discard("nope")).toBe(false)
  })

  it("comes back with everything after a restart", async () => {
    const offline = async (): Promise<SendResult> => ({ ok: false, error: "offline" })
    const first = new ActionQueue(storage, offline, DEFAULT_POLICY)

    await first.enqueue(action("a1", "stop-1"), T0)
    await first.enqueue(action("b1", "stop-2"), T0 + 1)
    await first.flush(T0 + 2)

    // A new instance over the same storage: the phone was restarted.
    const second = new ActionQueue(storage, offline, DEFAULT_POLICY)
    await second.load()

    expect(second.pendingCount()).toBe(2)
    expect(second.list().map((item) => item.id)).toEqual(["a1", "b1"])
  })
})
