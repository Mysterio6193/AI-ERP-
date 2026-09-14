import type { ActionKind, QueuedAction, SendResult } from "./queue"

/**
 * Talking to the ERP.
 *
 * Reads go straight out and fail loudly — if there is no signal, the driver
 * sees yesterday's cached run and knows it. Writes never go straight out: they
 * go through the queue, so a tap in a dead spot is recorded rather than lost.
 *
 * Pure: the session token and the fetch implementation are both injected, so
 * this is testable and carries no React Native import.
 */

export interface Session {
  token: string
  driverId: string
  name: string
}

export interface ClientOptions {
  baseUrl: string
  /** Injected so tests need no network and the app can swap in a retrying fetch. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export class Client {
  private session: Session | null = null

  constructor(private options: ClientOptions) {}

  setSession(session: Session | null) {
    this.session = session
  }

  /** Repointed at runtime once the stored server address is known. */
  setBaseUrl(baseUrl: string) {
    this.options = { ...this.options, baseUrl }
  }

  getBaseUrl() {
    return this.options.baseUrl
  }

  getSession() {
    return this.session
  }

  private get fetcher() {
    return this.options.fetchImpl ?? fetch
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController()
    // A phone on a marginal connection can hold a socket open for minutes.
    // Failing at a known point is what lets the queue decide to retry.
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000)

    try {
      return await this.fetcher(`${this.options.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.session ? { Authorization: `Bearer ${this.session.token}` } : {}),
          ...(init.headers ?? {}),
        },
      })
    } finally {
      clearTimeout(timer)
    }
  }

  async signIn(email: string, password: string): Promise<Session> {
    const response = await this.request("/api/driver/session", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok || !body?.success) {
      throw new ApiError(body?.error ?? "Could not sign in", response.status)
    }

    const session: Session = {
      token: body.data.token,
      driverId: body.data.driver.id,
      name: body.data.driver.name,
    }

    this.session = session
    return session
  }

  /** Today's run. Throws when offline so the caller can show cached data. */
  async todaysRoute() {
    const response = await this.request("/api/driver/route")
    const body = await response.json().catch(() => ({}))

    if (!response.ok || !body?.success) {
      throw new ApiError(body?.error ?? "Could not load the run", response.status)
    }

    return body.data
  }

  /**
   * The sender the queue drives.
   *
   * The action's own id goes out as the idempotency key: a reply lost on a
   * flaky connection would otherwise become a second delivery when the retry
   * lands.
   */
  sender = async (action: QueuedAction): Promise<SendResult> => {
    try {
      const response = await this.request(pathFor(action.kind, action.stopId), {
        method: "POST",
        headers: { "Idempotency-Key": action.id },
        body: JSON.stringify({ ...action.payload, clientActionId: action.id }),
      })

      if (response.ok) return { ok: true, status: response.status }

      const body = await response.json().catch(() => ({}))
      return { ok: false, status: response.status, error: body?.error }
    } catch (error) {
      // No status: the request never left. The queue treats that as retryable,
      // which is exactly right for a dead spot.
      return { ok: false, error: error instanceof Error ? error.message : "Network error" }
    }
  }
}

function pathFor(kind: ActionKind, stopId: string) {
  switch (kind) {
    case "stop.exception":
      return `/api/driver/stops/${stopId}/exception`
    default:
      return `/api/driver/stops/${stopId}`
  }
}
