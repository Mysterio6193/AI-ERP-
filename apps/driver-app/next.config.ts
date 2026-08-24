import path from "path"
import type { NextConfig } from "next"

const repoRoot = path.resolve(__dirname, "../..")

const nextConfig: NextConfig = {
  // Standalone lets the container ship a traced server instead of the whole
  // dependency tree. Without it the driver image carried every devDependency
  // and the core app's src/ — neither of which this app imports.
  output: "standalone",
  // Both roots must be the repository, not apps/driver-app. Dependencies are
  // hoisted to the root node_modules, so tracing from this directory would
  // resolve nothing; and apps/driver-app has its own package-lock.json, which
  // is exactly the marker Next.js would otherwise infer the root from.
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
}

export default nextConfig
