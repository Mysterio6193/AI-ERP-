import { NextRequest, NextResponse } from "next/server"

const CORE_APP_URL = process.env.CORE_APP_URL || "http://localhost:3000"
const DRIVER_SESSION_COOKIE = "driver_session"

async function proxy(request: NextRequest, path: string[]) {
  const incomingUrl = new URL(request.url)
  const targetUrl = new URL(`/api/${path.join("/")}`, CORE_APP_URL)
  targetUrl.search = incomingUrl.search

  const headers = new Headers(request.headers)
  headers.delete("host")
  headers.delete("connection")
  headers.delete("content-length")

  const driverSession = request.cookies.get(DRIVER_SESSION_COOKIE)?.value
  if (driverSession) {
    headers.set("x-driver-session", driverSession)
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
  }

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer()
  }

  const response = await fetch(targetUrl, init)
  const responseHeaders = new Headers(response.headers)
  responseHeaders.delete("content-encoding")
  responseHeaders.delete("content-length")
  responseHeaders.delete("transfer-encoding")

  const proxiedResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })

  const isDriverSessionRoute = path.length === 2 && path[0] === "driver" && path[1] === "session"

  if (isDriverSessionRoute && request.method === "POST" && response.ok) {
    try {
      const data = await response.clone().json()
      const token = data?.data?.token
      if (token) {
        proxiedResponse.cookies.set(DRIVER_SESSION_COOKIE, token, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 14,
        })
      }
    } catch {
      // Best effort only.
    }
  }

  if (isDriverSessionRoute && request.method === "DELETE") {
    proxiedResponse.cookies.delete(DRIVER_SESSION_COOKIE)
  }

  if (isDriverSessionRoute && request.method === "GET" && response.status === 401) {
    proxiedResponse.cookies.delete(DRIVER_SESSION_COOKIE)
  }

  return proxiedResponse
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(request, path)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(request, path)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(request, path)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(request, path)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(request, path)
}
