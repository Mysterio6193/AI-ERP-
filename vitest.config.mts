import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/**
 * Unit tests for the pure business logic.
 *
 * Deliberately scoped to functions that take their inputs as arguments rather
 * than reaching for the database. Those are where the arithmetic and the edge
 * cases live, they run in milliseconds, and they need no fixtures — so there is
 * no excuse not to run them. Flow-level behaviour that genuinely needs the
 * database is verified separately against the dev database.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
