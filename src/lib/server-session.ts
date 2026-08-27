import { cookies } from "next/headers"

import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/session-token"

/**
 * The signed-in user, from inside a server component.
 *
 * Everything in this app authenticates from a NextRequest, which server
 * components do not have. They read cookies through next/headers instead, so
 * this is the same verification reached a different way — not a second, weaker
 * path. It deliberately returns null rather than redirecting: the proxy already
 * decides who may reach a page, and a component that redirects on its own
 * competes with that and produces loops.
 */
export async function getSessionUser() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value
  if (!token) return null

  return verifySessionToken(token)
}
