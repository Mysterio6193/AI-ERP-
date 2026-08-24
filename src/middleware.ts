import { NextRequest, NextResponse } from "next/server"

import {
  ADMIN_SESSION_COOKIE,
  isAuthBypassEnabled,
  verifySessionToken,
} from "@/lib/session-token"

/**
 * Request gate for pages and the API.
 *
 * This file previously lived at the repository root, where Next.js never loaded
 * it because the application lives under `src/`. Every page and 41 API routes
 * were therefore reachable without authentication.
 *
 * Pages require an admin session. The API is deny-by-default for anonymous
 * callers: a request must carry *some* credential - the admin cookie, a
 * customer bearer token, or a driver session - unless its path is explicitly
 * public. Fine-grained authorisation still belongs in each route; this only
 * guarantees that nothing is reachable by a stranger with a URL.
 */

const PUBLIC_PAGE_ROUTES = new Set(["/signin", "/setup"])

/** Endpoints that must work with no credential at all. */
const PUBLIC_API_ROUTES = [
  "/api/health", // liveness probe; the route itself withholds detail from non-admins
  "/api/admin/session", // admin sign-in
  "/api/admin/setup", // first-run admin creation, self-gating once complete
  "/api/user/login",
  "/api/user/register",
  "/api/user/refresh",
  "/api/agent/telegram", // webhook, verified by Telegram's secret token header
  "/api/agent/email", // inbound email webhook, verified by its own shared secret
  "/api/stripe/webhook", // verified by Stripe's signature, not a session

  // The storefront browses categories before anyone signs in. This and the
  // product reads below only ever worked because AUTH_BYPASS short-circuited
  // this file; with the flag off — which is every production build — the
  // external shop's catalogue calls were refused outright.
  "/api/products/get-categories",

  // Liveness. A monitor has no session by definition, and a health check that
  // requires one reports the app as down whenever auth is misconfigured, which
  // is exactly when you need it to answer.
  "/api/health",
]

/**
 * Namespaces belonging to the customer storefront and driver app. These
 * authenticate with their own bearer tokens inside the route handlers, so
 * middleware only checks that a credential is present.
 */
const SELF_AUTHENTICATING_API_PREFIXES = [
  "/api/user/",
  "/api/order/",
  "/api/driver/",

  // The scheduler tick. It verifies CRON_SECRET as a Bearer token itself, and
  // falls back to an admin role check — so it is genuinely self-authenticating.
  // Without this, middleware demanded a session cookie that no cron service
  // sends, and the endpoint returned 401 to every scheduled trigger: agents
  // could never run unattended, and it only looked fine locally because
  // AUTH_BYPASS short-circuited this file.
  "/api/cron/",
]

/**
 * Storefront reads that validate a customer bearer token themselves.
 *
 * Listed individually rather than opening the whole `/api/products/` prefix:
 * that namespace also holds the staff catalogue, including its writes, and a
 * prefix here would drop those to "some credential present" — which accepts an
 * unverified Authorization header.
 */
const CUSTOMER_PRODUCT_ROUTES = [
  "/api/products/get-products",
  "/api/products/detail-product-variant",
]

function isStaticAsset(pathname: string) {
  return pathname.startsWith("/_next") || pathname === "/favicon.ico" || /\.[^/]+$/.test(pathname)
}

function isPublicApi(pathname: string) {
  return PUBLIC_API_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

function isSelfAuthenticatingApi(pathname: string) {
  return (
    SELF_AUTHENTICATING_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    CUSTOMER_PRODUCT_ROUTES.includes(pathname)
  )
}

/**
 * Presence of *some* credential.
 *
 * Only safe for the self-authenticating namespaces, where the route handler
 * validates the token itself and this is merely a cheap early reject. It must
 * never gate a staff route: `authorization` is accepted here unverified, so
 * `Authorization: Bearer anything` would satisfy it.
 */
function hasCredential(request: NextRequest) {
  return Boolean(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value ||
      request.headers.get("authorization") ||
      request.headers.get("x-driver-session") ||
      request.cookies.get("supplysure_driver_session")?.value ||
      request.cookies.get("supplysure_customer_session")?.value
  )
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isStaticAsset(pathname)) {
    return NextResponse.next()
  }

  const bypass = isAuthBypassEnabled()

  if (pathname.startsWith("/api/")) {
    if (bypass || isPublicApi(pathname)) {
      return NextResponse.next()
    }

    // Public branding read. The driver app fetches company identity before
    // sign-in so its lock screen matches the business; without this it only
    // worked under AUTH_BYPASS. Read-only — writes are guarded in the route.
    if (pathname === "/api/settings/company" && request.method === "GET") {
      return NextResponse.next()
    }

    if (isSelfAuthenticatingApi(pathname)) {
      return hasCredential(request)
        ? NextResponse.next()
        : NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // Staff API. A *verified* session only - `hasCredential` would accept an
    // unvalidated `Authorization` header, which let anyone reach the financial
    // routes. Per-route role checks still apply on top of this.
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
    const session = token ? await verifySessionToken(token) : null

    if (session) {
      return NextResponse.next()
    }

    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  if (bypass) {
    return PUBLIC_PAGE_ROUTES.has(pathname)
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next()
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  const session = token ? await verifySessionToken(token) : null

  if (PUBLIC_PAGE_ROUTES.has(pathname)) {
    return session ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next()
  }

  if (!session) {
    const signinUrl = new URL("/signin", request.url)
    signinUrl.searchParams.set("next", `${pathname}${search}`)
    return NextResponse.redirect(signinUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
