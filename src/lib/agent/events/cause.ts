import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Who caused what is happening right now.
 *
 * The loop defence in `match.ts` refuses to wake an agent with an event that
 * agent caused, and cuts a chain that has passed through too many agents. That
 * is only real if an event raised deep inside a tool call knows which agent is
 * running — and the call sites that raise events are ordinary business code
 * several layers down, which should not have to thread an agent id through
 * every function to get there.
 *
 * AsyncLocalStorage carries it instead. A run sets it once; everything the run
 * causes, however deep, sees it. Outside a run the store is empty and events
 * are attributed to a person, which is the correct default: a person's action
 * should wake every agent waiting on it.
 */

export interface AgentCause {
  agentId: string
  /** Agent hops that led to this run. A run a person started is 0. */
  depth: number
}

const storage = new AsyncLocalStorage<AgentCause>()

/** Runs `fn` with everything it causes attributed to this agent. */
export function withAgentCause<T>(cause: AgentCause, fn: () => Promise<T>): Promise<T> {
  return storage.run(cause, fn)
}

/** The agent currently running, if this code is inside one. */
export function currentAgentCause(): AgentCause | null {
  return storage.getStore() ?? null
}
