import { defineConfig } from "vitest/config"

/**
 * Only the logic that runs away from React Native is tested here: the queue,
 * its retry policy, its persistence. That is where a field app actually loses
 * work, and none of it needs a simulator.
 *
 * The tsconfig beside this file deliberately stands alone rather than
 * extending Expo's. These tests must run with nothing but vitest installed —
 * on CI, and before anyone has run an Expo install — and making them depend on
 * the mobile toolchain is the fastest way to have them quietly stop being run.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
})
