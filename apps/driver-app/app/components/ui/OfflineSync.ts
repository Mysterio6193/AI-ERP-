"use client"

export interface QueuedAction {
  id: string
  timestamp: number
  endpoint: string
  method: string
  payload?: any
  description: string
}

const STORAGE_KEY = "supplysure_offline_queue"

class OfflineSyncManager {
  private queue: QueuedAction[] = []
  private listeners: Array<(queue: QueuedAction[]) => void> = []

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          this.queue = JSON.parse(saved)
        }
      } catch (err) {
        console.warn("Failed to load offline queue:", err)
      }

      window.addEventListener("online", () => {
        void this.syncAll()
      })
    }
  }

  getQueue(): QueuedAction[] {
    return [...this.queue]
  }

  subscribe(listener: (queue: QueuedAction[]) => void): () => void {
    this.listeners.push(listener)
    listener(this.getQueue())
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private notify() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue))
    } catch (err) {
      console.warn("Failed to persist offline queue:", err)
    }
    this.listeners.forEach((l) => l(this.getQueue()))
  }

  enqueue(action: Omit<QueuedAction, "id" | "timestamp">) {
    const item: QueuedAction = {
      ...action,
      id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
    }
    this.queue.push(item)
    this.notify()
  }

  async syncAll(): Promise<{ success: number; failed: number }> {
    if (this.queue.length === 0) return { success: 0, failed: 0 }
    if (!navigator.onLine) return { success: 0, failed: this.queue.length }

    let successCount = 0
    let failedCount = 0
    const remainingQueue: QueuedAction[] = []

    for (const item of this.queue) {
      try {
        const res = await fetch(`/api/core/${item.endpoint}`, {
          method: item.method,
          headers: { "Content-Type": "application/json" },
          body: item.payload ? JSON.stringify(item.payload) : undefined,
        })

        if (res.ok) {
          successCount++
        } else {
          failedCount++
          remainingQueue.push(item)
        }
      } catch {
        failedCount++
        remainingQueue.push(item)
      }
    }

    this.queue = remainingQueue
    this.notify()
    return { success: successCount, failed: failedCount }
  }

  clearQueue() {
    this.queue = []
    this.notify()
  }
}

export const offlineSync = new OfflineSyncManager()
