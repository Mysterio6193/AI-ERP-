import AsyncStorageLike from "expo-secure-store"

import { Client } from "./client"
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

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000"

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

export const client = new Client({ baseUrl: API_BASE_URL })
export const queue = new ActionQueue(storage, client.sender)

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
