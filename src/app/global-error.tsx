"use client"

/**
 * The last resort: an error in the root layout itself.
 *
 * This replaces the entire document, so it cannot use the app shell, the theme
 * provider or any component that might be the thing that broke — which is why
 * it carries its own html and body tags and inline styles rather than
 * classNames. A styled error page that depends on the stylesheet that failed to
 * load shows nothing at all.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111" }}>
        <div style={{ maxWidth: 480, margin: "12vh auto", padding: "0 24px" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
            SupplySure could not start
          </h1>

          <p style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px", color: "#444" }}>
            Something failed before the application could load. This is not something you did, and
            nothing has been saved.
          </p>

          {error.digest ? (
            <p style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#666", margin: "0 0 16px" }}>
              Reference: {error.digest}
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            style={{
              fontSize: 13,
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "#fafafa",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
