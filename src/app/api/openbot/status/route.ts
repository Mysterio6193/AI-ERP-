import { NextResponse } from "next/server"

import { OPENBOT_URL } from "@/lib/openbot"

/**
 * Is OpenBot answering?
 *
 * OpenBot runs as its own stack on its own port, so the launcher's link to it
 * is dead until somebody starts it. The browser cannot find that out itself —
 * OpenBot sends no CORS headers, so a cross-origin fetch fails the same way
 * whether the server is down or merely unwilling to talk to us. Asking from
 * the server side gives an answer that means something.
 */

export const dynamic = "force-dynamic"

const PROBE_TIMEOUT_MS = 1500

export async function GET() {
  try {
    const response = await fetch(OPENBOT_URL, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })

    // Any HTTP answer means something is listening. OpenBot's own health is
    // its business; all this decides is whether the link is worth following.
    return NextResponse.json({ data: { running: true, url: OPENBOT_URL, status: response.status } })
  } catch {
    return NextResponse.json({ data: { running: false, url: OPENBOT_URL } })
  }
}
