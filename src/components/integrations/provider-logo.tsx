import type * as React from "react"

/**
 * Real vendor marks, drawn as SVG.
 *
 * Not emoji and not a generic tray icon: people recognise these tools by their
 * logo long before they read the label, and a row of lookalike glyphs makes a
 * list of integrations unscannable. Each path is the vendor's own mark in its
 * own colours, so Gmail's envelope and Google Calendar's grid read as different
 * products at a glance even though both say "Google" underneath.
 *
 * Drawn from paths rather than fetched, because an integrations page that waits
 * on six external image hosts is slow, and broken images look like broken
 * connections.
 */

interface LogoProps {
  className?: string
}

function GoogleCalendarLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Google Calendar">
      <rect x="3" y="4" width="18" height="17" rx="2.5" fill="#fff" stroke="#dadce0" strokeWidth="1.2" />
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5V8H3V6.5Z" fill="#1a73e8" />
      <path d="M7 2.6v3.2M17 2.6v3.2" stroke="#5f6368" strokeWidth="1.6" strokeLinecap="round" />
      <text x="12" y="17.6" textAnchor="middle" fontSize="8.4" fontWeight="700" fill="#1a73e8" fontFamily="system-ui, sans-serif">
        31
      </text>
    </svg>
  )
}

function GmailLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Gmail">
      <path d="M3.5 19.5h3v-7.3L3 9.4v8.7a1.4 1.4 0 0 0 .5 1.4Z" fill="#4285f4" />
      <path d="M17.5 19.5h3a1.4 1.4 0 0 0 1-1.4V9.4l-4 2.8v7.3Z" fill="#34a853" />
      <path d="M17.5 5.9v6.3l4-2.8V6.8c0-1.5-1.8-2.4-3-1.5l-1 .6Z" fill="#fbbc04" />
      <path d="M6.5 12.2V5.9L12 10l5.5-4.1v6.3L12 16.3l-5.5-4.1Z" fill="#ea4335" />
      <path d="M2.5 6.8v2.6l4 2.8V5.9l-1-.6c-1.2-.9-3 0-3 1.5Z" fill="#c5221f" />
    </svg>
  )
}

function OutlookLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Microsoft Outlook">
      <path d="M13 5.4 21 4v16l-8-1.4V5.4Z" fill="#0364b8" />
      <path d="M13 8.8h8v6.4h-8V8.8Z" fill="#0f6cbd" />
      <rect x="2.5" y="5.4" width="11" height="13.2" rx="1.6" fill="#0078d4" />
      <ellipse cx="8" cy="12" rx="3.1" ry="3.6" fill="none" stroke="#fff" strokeWidth="1.7" />
    </svg>
  )
}

function OutlookCalendarLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Outlook Calendar">
      <rect x="3" y="4.5" width="18" height="16" rx="2.2" fill="#0078d4" />
      <rect x="3" y="4.5" width="18" height="4.2" rx="2.2" fill="#0364b8" />
      <rect x="5.6" y="10.6" width="4" height="3.4" rx="0.7" fill="#fff" />
      <rect x="11" y="10.6" width="4" height="3.4" rx="0.7" fill="#fff" opacity="0.75" />
      <rect x="5.6" y="15.2" width="4" height="3.1" rx="0.7" fill="#fff" opacity="0.75" />
      <rect x="11" y="15.2" width="4" height="3.1" rx="0.7" fill="#fff" opacity="0.5" />
    </svg>
  )
}

function NotionLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Notion">
      <rect x="2.5" y="2.5" width="19" height="19" rx="3" fill="#fff" stroke="#111" strokeWidth="1.3" />
      <path
        d="M7.6 7.3v9.4M7.6 7.3l8.4 9.4M16 7.3v9.4"
        stroke="#111"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function SlackLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Slack">
      <path d="M6.2 14.6a1.9 1.9 0 1 1-1.9-1.9h1.9v1.9Zm1 0a1.9 1.9 0 0 1 3.8 0v4.8a1.9 1.9 0 0 1-3.8 0v-4.8Z" fill="#e01e5a" />
      <path d="M9.1 6.2a1.9 1.9 0 1 1 1.9-1.9v1.9H9.1Zm0 1a1.9 1.9 0 0 1 0 3.8H4.3a1.9 1.9 0 0 1 0-3.8h4.8Z" fill="#36c5f0" />
      <path d="M17.8 9.1a1.9 1.9 0 1 1 1.9 1.9h-1.9V9.1Zm-1 0a1.9 1.9 0 0 1-3.8 0V4.3a1.9 1.9 0 0 1 3.8 0v4.8Z" fill="#2eb67d" />
      <path d="M14.9 17.8a1.9 1.9 0 1 1-1.9 1.9v-1.9h1.9Zm0-1a1.9 1.9 0 0 1 0-3.8h4.8a1.9 1.9 0 0 1 0 3.8h-4.8Z" fill="#ecb22e" />
    </svg>
  )
}

const LOGOS: Record<string, (props: LogoProps) => React.ReactElement> = {
  google_calendar: GoogleCalendarLogo,
  gmail: GmailLogo,
  outlook: OutlookLogo,
  outlook_calendar: OutlookCalendarLogo,
  notion: NotionLogo,
  slack: SlackLogo,
}

/**
 * A provider with no mark of its own falls back to its initial rather than a
 * shared placeholder, so two unknown providers still look like two things.
 */
function InitialLogo({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={name}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="4" className="fill-muted" />
      <text
        x="12"
        y="16.2"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        className="fill-muted-foreground"
        fontFamily="system-ui, sans-serif"
      >
        {name.slice(0, 1).toUpperCase()}
      </text>
    </svg>
  )
}

export function ProviderLogo({
  provider,
  name,
  className = "h-8 w-8",
}: {
  provider: string
  name: string
  className?: string
}) {
  const Logo = LOGOS[provider]
  if (!Logo) return <InitialLogo name={name} className={className} />

  return <Logo className={className} />
}
