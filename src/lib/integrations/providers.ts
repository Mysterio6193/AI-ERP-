/**
 * The outside tools staff can connect, and what it takes to reach each one.
 *
 * One definition per provider, holding the real OAuth endpoints and the
 * environment variables its credentials come from. Nothing here is decorative:
 * if a provider has no client id configured, the page says "setup required"
 * rather than showing a Connect button that opens a broken consent screen — a
 * button that cannot work is worse than one visibly absent, because people try
 * it and conclude the product is broken.
 */

export type IntegrationCategory = "calendar" | "email" | "notes" | "messaging" | "payments"

/**
 * Who a connection belongs to.
 *
 * A mailbox is one person's: two staff connect their own, and one of them
 * disconnecting must not cut off the other. A payment gateway is the
 * business's: it is connected once, everybody bills through it, and one person
 * disconnecting it stops the company taking money. Treating those the same way
 * is how you end up with an invoice that cannot be paid because whoever set up
 * Stripe left the company.
 */
export type ConnectionScope = "user" | "company"

export interface ProviderDefinition {
  id: string
  name: string
  vendor: string
  category: IntegrationCategory
  scope: ConnectionScope
  summary: string
  /** What connecting actually permits, said before anyone consents. */
  grants: string[]
  authUrl: string
  tokenUrl: string
  scopes: string[]
  clientIdEnv: string
  clientSecretEnv: string
  /** Params a provider needs before it will return a refresh token. */
  extraAuthParams?: Record<string, string>
  /** Where the connected account's identity is read after the exchange. */
  profileUrl?: string
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "google_calendar",
    name: "Google Calendar",
    vendor: "Google",
    category: "calendar",
    scope: "user",
    summary: "Put deliveries, production runs and follow-ups in the calendar staff already have open.",
    grants: ["See your calendars and events", "Create and update events"],
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "openid",
      "email",
    ],
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    // Google returns a refresh token only on first consent unless both of these
    // are sent, and without one the connection dies within the hour.
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    profileUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
  },
  {
    id: "gmail",
    name: "Gmail",
    vendor: "Google",
    category: "email",
    scope: "user",
    summary: "Send confirmations and statements from your own mailbox, and file replies against the customer they came from.",
    grants: ["Read your mail", "Send mail as you"],
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "openid",
      "email",
    ],
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    profileUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
  },
  {
    id: "outlook",
    name: "Outlook",
    vendor: "Microsoft",
    category: "email",
    scope: "user",
    summary: "The same for Microsoft 365 mailboxes, for teams that live in Outlook rather than Gmail.",
    grants: ["Read your mail", "Send mail as you"],
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    // offline_access is what makes Microsoft return a refresh token at all.
    scopes: ["offline_access", "openid", "email", "Mail.Read", "Mail.Send", "User.Read"],
    clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
    profileUrl: "https://graph.microsoft.com/v1.0/me",
  },
  {
    id: "outlook_calendar",
    name: "Outlook Calendar",
    vendor: "Microsoft",
    category: "calendar",
    scope: "user",
    summary: "Deliveries and runs on the Microsoft 365 calendar.",
    grants: ["See your calendars", "Create and update events"],
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["offline_access", "openid", "email", "Calendars.ReadWrite", "User.Read"],
    clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
    profileUrl: "https://graph.microsoft.com/v1.0/me",
  },
  {
    id: "notion",
    name: "Notion",
    vendor: "Notion Labs",
    category: "notes",
    scope: "user",
    summary: "Push supplier notes, meeting outcomes and account summaries into the workspace the team already writes in.",
    grants: ["Read the pages you share with it", "Create and update those pages"],
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    // Notion grants access per page at consent time rather than by scope.
    scopes: [],
    clientIdEnv: "NOTION_OAUTH_CLIENT_ID",
    clientSecretEnv: "NOTION_OAUTH_CLIENT_SECRET",
    extraAuthParams: { owner: "user" },
  },
  {
    id: "stripe",
    name: "Stripe",
    vendor: "Stripe",
    category: "payments",
    // The business's gateway, not a person's. One connection, everybody bills
    // through it, and it must survive whoever set it up leaving.
    scope: "company",
    summary: "Take card payments on invoices and orders without pasting a secret key into the server config.",
    grants: ["Create charges and payment links on your account", "Read payouts and balance"],
    authUrl: "https://connect.stripe.com/oauth/authorize",
    tokenUrl: "https://connect.stripe.com/oauth/token",
    scopes: ["read_write"],
    clientIdEnv: "STRIPE_CONNECT_CLIENT_ID",
    clientSecretEnv: "STRIPE_SECRET_KEY",
  },
  {
    id: "slack",
    name: "Slack",
    vendor: "Slack",
    category: "messaging",
    scope: "user",
    summary: "Send the operational alerts that already go to Telegram into the channel your team actually watches.",
    grants: ["Post messages to channels you choose"],
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["chat:write", "channels:read"],
    clientIdEnv: "SLACK_OAUTH_CLIENT_ID",
    clientSecretEnv: "SLACK_OAUTH_CLIENT_SECRET",
  },
]

export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((provider) => provider.id === id)
}

/**
 * Whether this deployment can offer the provider at all.
 *
 * Credentials are per-deployment, not per-user: somebody has to register the
 * app with Google or Microsoft first. Until that happens the honest answer is
 * that it needs setting up.
 */
export function isProviderConfigured(
  provider: ProviderDefinition,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return Boolean(env[provider.clientIdEnv] && env[provider.clientSecretEnv])
}

export const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  calendar: "Calendars",
  payments: "Payments",
  email: "Email",
  notes: "Notes and documents",
  messaging: "Messaging",
}
