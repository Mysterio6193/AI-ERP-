"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"

const emptySubscribe = () => () => {}

export function useThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  const isDark = mounted ? resolvedTheme === "dark" : false

  const toggle = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  return {
    theme,
    resolvedTheme,
    isDark,
    toggle,
    setTheme,
    mounted,
  }
}
