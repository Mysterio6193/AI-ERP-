"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

export const GO_MAP: Record<string, string> = {
  d: "/",
  o: "/orders",
  c: "/customers",
  i: "/inventory",
  p: "/products",
  f: "/finance",
  w: "/warehouse",
  s: "/suppliers",
  r: "/routes",
  q: "/quotes",
  u: "/purchase-orders",
}

export const NEW_MAP: Record<string, string> = {
  o: "/orders/new",
  p: "/purchase-orders/new",
  q: "/quotes/new",
}

const CHORD_TIMEOUT_MS = 1500

function isInputElement(element: Element | null): boolean {
  if (!element) return false
  const tagName = element.tagName.toUpperCase()
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return true
  }
  if (element.closest && element.closest('[contenteditable="true"]')) {
    return true
  }
  return false
}

export function useKeyboardShortcuts() {
  const router = useRouter()
  const pendingPrefixRef = useRef<"g" | "n" | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clearPending = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      pendingPrefixRef.current = null
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent execution if typing in an input element
      const target = e.target as Element | null
      if (isInputElement(target) || isInputElement(document.activeElement)) {
        return
      }

      // Prevent execution if modifier keys are pressed
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }

      const key = e.key.toLowerCase()

      // Handle second key of chord if prefix is active
      if (pendingPrefixRef.current === "g") {
        clearPending()
        const destination = GO_MAP[key]
        if (destination) {
          e.preventDefault()
          router.push(destination)
          return
        }
      } else if (pendingPrefixRef.current === "n") {
        clearPending()
        const destination = NEW_MAP[key]
        if (destination) {
          e.preventDefault()
          router.push(destination)
          return
        }
      }

      // Handle chord prefix initiation
      if (key === "g" || key === "n") {
        pendingPrefixRef.current = key
        timerRef.current = setTimeout(() => {
          pendingPrefixRef.current = null
          timerRef.current = null
        }, CHORD_TIMEOUT_MS)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      clearPending()
    }
  }, [router])
}
