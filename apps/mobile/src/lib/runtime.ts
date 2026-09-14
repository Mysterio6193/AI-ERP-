import AsyncStorageLike from "expo-secure-store"

import { Client } from "./client"
import { defaultApiBase, normalizeApiBase } from "./endpoint"
import { ActionQueue, type QueuedAction, type QueueStorage } from "./queue"

/**
 * The one place the app wires itself to the device.
 *
 * Everything above this file — the queue, the client — takes its storage and
 * its fetch as arguments, which is what lets them be tested with no simulator.
 * This module is the only part that cannot be.
 */

const QUEUE_KEY = "supplysure.queue.v1"
const RUN_KEY = "supplysure.run.v1"
const ENDPOINT_KEY = "supplysure.endpoint.v1"

const storage: QueueStorage = {
  async load() {
    try {
      const raw = await AsyncStorageLike.getItemAsync(QUEUE_KEY)
      return raw ? (JSON.parse(raw) as QueuedAction[]) : []
    } catch {
      // A corrupt store must not stop the app opening. The work is lost either
      // way; refusing to start loses the rest of the day as well.
      return []
    }
  },
  async save(actions) {
    await AsyncStorageLike.setItemAsync(QUEUE_KEY, JSON.stringify(actions))
  },
}

/**
 * Starts on the fallback and is repointed once the stored address is read.
 *
 * The same binary from the App Store serves customers we host and customers
 * running their own install; the second group cannot rebuild the app to put
 * their address in it, so the server is chosen on the device rather than at
 * build time.
 */
export const client = new Client({ baseUrl: defaultApiBase() })
export const queue = new ActionQueue(storage, client.sender)

/** The address in use, after any stored choice is applied. */
export async function loadApiBase(): Promise<string> {
  try {
    const stored = await AsyncStorageLike.getItemAsync(ENDPOINT_KEY)
    if (stored) {
      const parsed = normalizeApiBase(stored)
      if (parsed.ok) {
        client.setBaseUrl(parsed.url)
        return parsed.url
      }
    }
  } catch {
    // An unreadable store falls back rather than blocking sign in.
  }

  const fallback = defaultApiBase()
  client.setBaseUrl(fallback)
  return fallback
}

/** Saves a server address that has already been probed. */
export async function saveApiBase(url: string) {
  const parsed = normalizeApiBase(url)
  if (!parsed.ok) return parsed

  await AsyncStorageLike.setItemAsync(ENDPOINT_KEY, parsed.url)
  client.setBaseUrl(parsed.url)
  return parsed
}

export async function writeCachedRun(stops: unknown) {
  try {
    await AsyncStorageLike.setItemAsync(RUN_KEY, JSON.stringify(stops))
  } catch {
    // Caching is a convenience; failing to cache must not fail the fetch.
  }
}

export async function readCachedRun() {
  try {
    const raw = await AsyncStorageLike.getItemAsync(RUN_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
