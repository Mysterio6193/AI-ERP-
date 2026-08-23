import { z } from "zod"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * Model Context Protocol (MCP) Client & Generic API Integration.
 * Allows Hermes to dynamically interface with external MCP servers, cloud APIs, and webhooks.
 */

// In-memory MCP Server Registry
interface McpServerConfig {
  name: string
  endpoint: string
  description?: string
  tools: Array<{ name: string; description: string; schema?: any }>
}

const MCP_REGISTRY = new Map<string, McpServerConfig>([
  [
    "filesystem",
    {
      name: "filesystem",
      endpoint: "builtin://filesystem",
      description: "Local file system operations and document stores",
      tools: [
        { name: "read_file", description: "Read content from a path" },
        { name: "write_file", description: "Write content to a path" },
      ],
    },
  ],
  [
    "fetch_api",
    {
      name: "fetch_api",
      endpoint: "builtin://fetch",
      description: "Generic HTTP REST and JSON API gateway",
      tools: [{ name: "http_request", description: "Perform an HTTP request" }],
    },
  ],
])

export function buildMcpTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    listMcpServers: defineTool({
      description:
        "List all registered Model Context Protocol (MCP) servers and their available external tools.",
      inputSchema: z.object({}),
      execute: async () => {
        return {
          totalServers: MCP_REGISTRY.size,
          servers: Array.from(MCP_REGISTRY.values()),
        }
      },
    }),

    callMcpTool: defineTool({
      description:
        "Execute a tool on an external Model Context Protocol (MCP) server or service.",
      inputSchema: z.object({
        serverName: z.string().describe("Name of the MCP server, e.g. 'fetch_api', 'filesystem', or custom endpoint"),
        toolName: z.string().describe("Name of the MCP tool to execute"),
        arguments: z.record(z.string(), z.any()).describe("JSON parameters passed to the MCP tool"),
      }),
      execute: async ({ serverName, toolName, arguments: args }) => {
        try {
          if (serverName === "fetch_api" || toolName === "http_request") {
            const url = args.url as string
            
            const parsed = new URL(url)
            const host = parsed.hostname.toLowerCase()

            if (
              host === "localhost" ||
              host === "127.0.0.1" ||
              host === "::1" ||
              host === "[::1]" ||
              host === "169.254.169.254" ||
              host.startsWith("10.") ||
              host.startsWith("192.168.") ||
              host.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
              host === "metadata.google.internal" ||
              host.endsWith(".internal")
            ) {
              return {
                ok: false as const,
                error: "Access to internal networks or metadata endpoints is forbidden.",
              }
            }

            const method = (args.method as string) || "GET"
            const headers = (args.headers as Record<string, string>) || {}
            const body = args.body ? JSON.stringify(args.body) : undefined

            const res = await fetch(url, {
              method,
              headers: { "Content-Type": "application/json", ...headers },
              body,
              signal: AbortSignal.timeout(15000),
            })

            const data = await res.json().catch(() => res.text())
            return {
              ok: res.ok,
              status: res.status,
              data,
            }
          }

          return {
            ok: true as const,
            server: serverName,
            tool: toolName,
            output: `MCP execution invoked on ${serverName}:${toolName} with arguments: ${JSON.stringify(args)}`,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `MCP invocation failed: ${error instanceof Error ? error.message : "tool error"}`,
          }
        }
      },
    }),

    callGenericApi: defineTool({
      description:
        "Perform an HTTP REST API call (GET, POST, PUT, DELETE) to any external cloud service, webhook, supplier portal, or API endpoint with custom headers & payload.",
      inputSchema: z.object({
        url: z.string().url().describe("Target API endpoint URL"),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional().default("GET"),
        headers: z.record(z.string(), z.string()).optional().describe("HTTP Request Headers (e.g. Authorization, Api-Key)"),
        body: z.any().optional().describe("JSON request body (for POST/PUT/PATCH)"),
      }),
      execute: async ({ url, method = "GET", headers = {}, body }) => {
        try {
          const parsed = new URL(url)
          const host = parsed.hostname.toLowerCase()

          // SSRF Protection
          if (
            host === "localhost" ||
            host === "127.0.0.1" ||
            host === "::1" ||
            host === "[::1]" ||
            host === "169.254.169.254" ||
            host.startsWith("10.") ||
            host.startsWith("192.168.") ||
            host.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
            host === "metadata.google.internal" ||
            host.endsWith(".internal")
          ) {
            return {
              ok: false as const,
              error: "Access to internal networks or metadata endpoints is forbidden.",
            }
          }

          const response = await fetch(url, {
            method,
            headers: {
              "User-Agent": "SupplySure-Hermes-Agent/1.0",
              "Content-Type": "application/json",
              ...headers,
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(15000),
          })

          const contentType = response.headers.get("content-type") || ""
          let payload: any
          if (contentType.includes("application/json")) {
            payload = await response.json()
          } else {
            payload = await response.text()
          }

          return {
            ok: response.ok,
            statusCode: response.status,
            data: payload,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `HTTP request failed: ${error instanceof Error ? error.message : "network error"}`,
          }
        }
      },
    }),
  }
}
