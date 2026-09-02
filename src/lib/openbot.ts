/**
 * Where the OpenBot UI answers.
 *
 * OpenBot is the submodule at `apps/openbot` — a separate stack with its own
 * Docker Compose, PostgreSQL and Vite server. `APP_PORT` in its `.env` decides
 * this, and defaults to 3010. Set `OPENBOT_URL` here if you move it.
 */
export const OPENBOT_URL = process.env.OPENBOT_URL ?? "http://localhost:3010"
