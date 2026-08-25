/**
 * Noticing when a turn has stopped moving.
 *
 * `runtime.ts` awaits `agent.generate()` with no deadline on it. If the model
 * provider accepts the request and then never answers — which is not exotic on
 * a free tier — that await never settles. On the chat path someone eventually
 * closes the tab. On every unattended path, which is Telegram, the scheduler
 * and the proactive loop, nothing closes it.
 *
 * The scheduler survives this, and it is worth being precise about why: it
 * writes `nextRunAt` forward *before* starting the agent, so a hung run does
 * not hold the schedule. What that buys is also the problem. Every tick starts
 * another run while the last one is still hanging, each holding a database
 * connection and a provider socket nothing will ever close, and each leaving
 * an `AgentRun` stuck at `running`. A daily routine degrades quietly; an
 * hourly one accumulates.
 *
 * On the conversational paths the failure is simpler and worse: the person
 * gets nothing, with no error, because from the outside a hung turn and a slow
 * one look identical until you stop waiting.
 *
 * Two different shapes are needed, because the two paths fail differently.
 *
 * `withDeadline` covers `generate`: one call, one answer, so a wall-clock limit
 * is the whole of it.
 *
 * `TurnWatchdog` covers streaming, where a wall-clock limit is wrong — a long
 * answer that is still arriving is healthy, and cutting it off at sixty seconds
 * would punish exactly the runs that are working hardest. What matters there is
 * *silence*: not how long the turn has taken, but how long since it last said
 * anything.
 *
 * The clock design, and the pause/resume distinction that makes it correct, is
 * taken from OpenBot's `server/src/channels/turn-watchdog.ts` (MIT) — see
 * docs/THIRD_PARTY.md.
 */

/** Injectable so tests do not have to wait in real time. */
export type Clock = () => number

/** How long a stream may say nothing before the turn is given up on. */
export const DEFAULT_STALL_MS = 90_000

/** How long a single `generate` may take. Generous: tool loops are slow. */
export const DEFAULT_TURN_TIMEOUT_MS = 180_000

export class TurnTimeoutError extends Error {
  readonly waitedMs: number

  constructor(label: string, waitedMs: number) {
    super(`${label} did not finish within ${Math.round(waitedMs / 1000)}s.`)
    this.name = "TurnTimeoutError"
    this.waitedMs = waitedMs
  }
}

/**
 * Give a promise a deadline.
 *
 * The underlying call is not cancelled unless an `onTimeout` is supplied to do
 * it — `Promise.race` only stops the *waiting*. That is the honest limit of
 * this: it frees the caller and lets the run be marked failed, which is what
 * unblocks the scheduler, but a wedged socket stays wedged until the runtime
 * collects it. Pass the abort so it does not.
 */
export async function withDeadline<T>(
  work: Promise<T>,
  options: { ms?: number; label?: string; onTimeout?: () => void }
): Promise<T> {
  const ms = options.ms ?? DEFAULT_TURN_TIMEOUT_MS
  const label = options.label ?? "The model call"

  // A non-positive deadline means "no deadline", so a deployment that has not
  // configured one gets exactly the behaviour it had before this existed
  // rather than a limit it never asked for.
  if (ms <= 0) return work

  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          options.onTimeout?.()
          reject(new TurnTimeoutError(label, ms))
        }, ms)
        // Never the reason a process refuses to exit.
        timer.unref?.()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export interface WatchedTurn {
  id: string
  /** Which agent, for the log that says what stalled. */
  agent: string
}

export interface StalledTurn extends WatchedTurn {
  silentForMs: number
  /**
   * Chunks, not events — one chunk can carry several, and the boundaries are
   * the network's. Zero is the fact worth reading: the provider accepted the
   * request and then said nothing at all.
   */
  chunks: number
}

interface OpenTurn extends WatchedTurn {
  lastChunkAt: number
  chunks: number
  paused: boolean
}

/**
 * The clock on a set of streaming turns.
 *
 * Deliberately holds no timer of its own. The caller decides how often to
 * `sweep`, which keeps this pure enough to test by moving a fake clock, and
 * means an idle process holds nothing at all.
 */
export class TurnWatchdog {
  private readonly stallMs: number
  private readonly onStall: (turn: StalledTurn) => void
  private readonly now: Clock
  private readonly turns = new Map<string, OpenTurn>()

  constructor(options: { stallMs?: number; onStall: (turn: StalledTurn) => void; now?: Clock }) {
    this.stallMs = options.stallMs ?? DEFAULT_STALL_MS
    this.onStall = options.onStall
    this.now = options.now ?? (() => Date.now())
  }

  /** A non-positive timeout switches the whole thing off. */
  get enabled(): boolean {
    return this.stallMs > 0
  }

  get watching(): number {
    return this.turns.size
  }

  open(turn: WatchedTurn): void {
    if (!this.enabled) return

    this.turns.set(turn.id, { ...turn, lastChunkAt: this.now(), chunks: 0, paused: false })
  }

  /** The provider said something. The only evidence it is still alive. */
  record(id: string): void {
    const turn = this.turns.get(id)
    if (!turn) return

    turn.lastChunkAt = this.now()
    turn.chunks += 1
  }

  /**
   * Stop the clock while waiting on whoever is *reading* the stream.
   *
   * This is the distinction that makes the watchdog correct rather than merely
   * present. A consumer that pauses — a browser on a slow connection, a
   * Telegram send taking its time — is not the provider going quiet, and timing
   * across it would report a healthy turn as a stalled one. The only silence
   * ever counted is silence on the wire.
   */
  pause(id: string): void {
    const turn = this.turns.get(id)
    if (turn) turn.paused = true
  }

  resume(id: string): void {
    const turn = this.turns.get(id)
    if (!turn) return

    // Restarted rather than resumed: the wait was the consumer's, so none of
    // it counts against the provider.
    turn.lastChunkAt = this.now()
    turn.paused = false
  }

  close(id: string): void {
    this.turns.delete(id)
  }

  /** Returns how many turns were given up on. */
  sweep(): number {
    if (!this.enabled) return 0

    const now = this.now()
    let stalled = 0

    for (const [id, turn] of this.turns) {
      if (turn.paused) continue

      const silentForMs = now - turn.lastChunkAt
      if (silentForMs < this.stallMs) continue

      // Removed before the callback, so a callback that throws cannot leave a
      // turn to be reported as stalled again on the next sweep.
      this.turns.delete(id)
      stalled += 1

      try {
        this.onStall({ id, agent: turn.agent, silentForMs, chunks: turn.chunks })
      } catch (error) {
        // One stuck turn must not stop the others being closed. Logged loudly:
        // a watchdog that fails silently is worse than not having one.
        console.error(
          `[agent] watchdog callback threw for ${turn.agent} (${id}): ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }

    return stalled
  }
}

/** How often to look, derived from the deadline rather than fixed. */
export function sweepIntervalFor(stallMs: number): number {
  return Math.min(5_000, Math.max(50, Math.floor(stallMs / 4)))
}

/**
 * What to tell a person when a turn was given up on.
 *
 * Says what was observed rather than what was concluded, says the turn is over,
 * and says what to do next. No run id and no milliseconds — an identifier in a
 * sentence is something the reader has to decide to ignore.
 */
export function describeStall(agentName: string, silentForMs: number): string {
  return (
    `${agentName} stopped responding — nothing arrived for ${inWords(silentForMs)}, ` +
    `so this turn was ended. Ask again, or check the model provider.`
  )
}

function inWords(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) {
    const minutes = ms / 60_000
    return minutes === 1 ? "a minute" : `${minutes} minutes`
  }

  // Floored at a second: "nothing arrived for 0 seconds" makes a reader doubt
  // everything else on the screen.
  const seconds = Math.max(1, Math.round(ms / 1_000))
  return seconds === 1 ? "a second" : `${seconds} seconds`
}

/**
 * The configured turn deadline.
 *
 * Read per call rather than captured at import, so changing it does not need a
 * restart. `AGENT_TURN_TIMEOUT_MS=0` switches it off for anyone who would
 * rather have the old unbounded behaviour than a limit they did not choose.
 */
export function turnTimeoutMs(): number {
  const raw = process.env.AGENT_TURN_TIMEOUT_MS
  if (raw === undefined || raw === "") return DEFAULT_TURN_TIMEOUT_MS

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : DEFAULT_TURN_TIMEOUT_MS
}
