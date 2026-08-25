import { describe, expect, it, vi } from "vitest"
import {
  DEFAULT_STALL_MS,
  TurnTimeoutError,
  TurnWatchdog,
  describeStall,
  sweepIntervalFor,
  withDeadline,
} from "@/lib/agent/watchdog"

/** A clock the tests move by hand, so nothing waits in real time. */
function fakeClock(start = 0) {
  let now = start
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

describe("withDeadline", () => {
  it("returns the value when the work finishes in time", async () => {
    await expect(withDeadline(Promise.resolve("ok"), { ms: 1000 })).resolves.toBe("ok")
  })

  it("rejects with a TurnTimeoutError when it does not", async () => {
    const never = new Promise<string>(() => {})
    await expect(withDeadline(never, { ms: 10, label: "ops turn" })).rejects.toBeInstanceOf(
      TurnTimeoutError
    )
  })

  it("names what timed out, because the log is read by a person", async () => {
    const never = new Promise<string>(() => {})
    await expect(withDeadline(never, { ms: 10, label: "ops turn" })).rejects.toThrow(/ops turn/)
  })

  it("passes a rejection through rather than turning it into a timeout", async () => {
    const boom = Promise.reject(new Error("provider said no"))
    await expect(withDeadline(boom, { ms: 1000 })).rejects.toThrow("provider said no")
  })

  it("calls onTimeout so the caller can abort the underlying request", async () => {
    // Promise.race only stops the waiting; without this the socket stays open.
    const abort = vi.fn()
    const never = new Promise<string>(() => {})

    await expect(withDeadline(never, { ms: 10, onTimeout: abort })).rejects.toThrow()
    expect(abort).toHaveBeenCalledOnce()
  })

  it("treats a non-positive deadline as no deadline", async () => {
    // A deployment that has not configured one keeps the behaviour it had,
    // rather than getting a limit it never asked for.
    await expect(withDeadline(Promise.resolve("ok"), { ms: 0 })).resolves.toBe("ok")
  })
})

describe("TurnWatchdog", () => {
  it("says nothing while the provider keeps talking", () => {
    const clock = fakeClock()
    const onStall = vi.fn()
    const dog = new TurnWatchdog({ stallMs: 100, onStall, now: clock.now })

    dog.open({ id: "a", agent: "ops" })

    for (let i = 0; i < 5; i++) {
      clock.advance(80)
      dog.record("a")
      expect(dog.sweep()).toBe(0)
    }

    expect(onStall).not.toHaveBeenCalled()
  })

  it("gives up on a turn that has gone quiet", () => {
    const clock = fakeClock()
    const onStall = vi.fn()
    const dog = new TurnWatchdog({ stallMs: 100, onStall, now: clock.now })

    dog.open({ id: "a", agent: "ops" })
    clock.advance(150)

    expect(dog.sweep()).toBe(1)
    expect(onStall).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a", agent: "ops", silentForMs: 150, chunks: 0 })
    )
  })

  it("reports zero chunks when the provider never said anything at all", () => {
    // The fact worth reading: it accepted the request and then went silent.
    const clock = fakeClock()
    const onStall = vi.fn()
    const dog = new TurnWatchdog({ stallMs: 100, onStall, now: clock.now })

    dog.open({ id: "a", agent: "ops" })
    clock.advance(150)
    dog.sweep()

    expect(onStall.mock.calls[0][0].chunks).toBe(0)
  })

  it("does not blame the provider for a slow consumer", () => {
    // The distinction the whole design rests on. A browser on a bad connection
    // is not a model that has stopped answering.
    const clock = fakeClock()
    const onStall = vi.fn()
    const dog = new TurnWatchdog({ stallMs: 100, onStall, now: clock.now })

    dog.open({ id: "a", agent: "ops" })
    dog.record("a")

    dog.pause("a")
    clock.advance(10_000) // consumer took ten seconds to accept delivery
    expect(dog.sweep()).toBe(0)

    dog.resume("a")
    expect(dog.sweep()).toBe(0)

    expect(onStall).not.toHaveBeenCalled()
  })

  it("restarts the clock on resume so the consumer's wait never counts", () => {
    const clock = fakeClock()
    const onStall = vi.fn()
    const dog = new TurnWatchdog({ stallMs: 100, onStall, now: clock.now })

    dog.open({ id: "a", agent: "ops" })
    dog.pause("a")
    clock.advance(500)
    dog.resume("a")

    clock.advance(50)
    expect(dog.sweep()).toBe(0)
  })

  it("reports a stalled turn once, not on every sweep", () => {
    const clock = fakeClock()
    const onStall = vi.fn()
    const dog = new TurnWatchdog({ stallMs: 100, onStall, now: clock.now })

    dog.open({ id: "a", agent: "ops" })
    clock.advance(150)

    dog.sweep()
    dog.sweep()
    dog.sweep()

    expect(onStall).toHaveBeenCalledOnce()
  })

  it("keeps closing the others when one callback throws", () => {
    // A wedged turn must not hold everybody else's stuck run open.
    const clock = fakeClock()
    const seen: string[] = []
    const dog = new TurnWatchdog({
      stallMs: 100,
      now: clock.now,
      onStall: (turn) => {
        if (turn.id === "a") throw new Error("handler exploded")
        seen.push(turn.id)
      },
    })

    dog.open({ id: "a", agent: "ops" })
    dog.open({ id: "b", agent: "sales" })
    clock.advance(150)

    expect(dog.sweep()).toBe(2)
    expect(seen).toEqual(["b"])
    expect(dog.watching).toBe(0)
  })

  it("stops watching a turn that closed normally", () => {
    const clock = fakeClock()
    const onStall = vi.fn()
    const dog = new TurnWatchdog({ stallMs: 100, onStall, now: clock.now })

    dog.open({ id: "a", agent: "ops" })
    dog.close("a")
    clock.advance(10_000)

    expect(dog.sweep()).toBe(0)
    expect(dog.watching).toBe(0)
  })

  it("is inert when switched off", () => {
    const onStall = vi.fn()
    const dog = new TurnWatchdog({ stallMs: 0, onStall })

    dog.open({ id: "a", agent: "ops" })

    expect(dog.enabled).toBe(false)
    expect(dog.watching).toBe(0)
    expect(dog.sweep()).toBe(0)
  })

  it("ignores record and pause for a turn it is not watching", () => {
    const dog = new TurnWatchdog({ stallMs: 100, onStall: vi.fn() })

    expect(() => {
      dog.record("ghost")
      dog.pause("ghost")
      dog.resume("ghost")
      dog.close("ghost")
    }).not.toThrow()
  })
})

describe("sweepIntervalFor", () => {
  it("reports a stall within a quarter of the deadline", () => {
    expect(sweepIntervalFor(20_000)).toBe(5_000)
  })

  it("does not spin on a very short deadline", () => {
    expect(sweepIntervalFor(10)).toBe(50)
  })

  it("still looks regularly on a very long one", () => {
    expect(sweepIntervalFor(600_000)).toBe(5_000)
  })
})

describe("describeStall", () => {
  it("names the agent and says what to do next", () => {
    const said = describeStall("Chloe", 90_000)
    expect(said).toContain("Chloe")
    expect(said).toMatch(/ask again/i)
  })

  it("says the duration the way a person would", () => {
    expect(describeStall("Chloe", 60_000)).toContain("a minute")
    expect(describeStall("Chloe", 120_000)).toContain("2 minutes")
  })

  it("never says zero seconds", () => {
    // A sentence that makes the reader doubt everything else on the screen.
    expect(describeStall("Chloe", 200)).toContain("a second")
  })

  it("carries no run id or millisecond count", () => {
    expect(describeStall("Chloe", DEFAULT_STALL_MS)).not.toMatch(/\d+ms|[0-9a-f]{8}-/)
  })
})
