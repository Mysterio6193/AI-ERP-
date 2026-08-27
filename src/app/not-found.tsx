import Link from "next/link"
import { FileQuestion } from "lucide-react"

/**
 * A page that does not exist.
 *
 * Worth having its own file rather than Next's default, because most 404s here
 * are not typos — they are a link to an order, invoice or customer that was
 * deleted, or that belongs to a company the user is not currently acting as.
 * Saying that is more useful than "404".
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <FileQuestion className="mx-auto h-10 w-10 text-muted-foreground" />

        <div className="space-y-1">
          <h2 className="text-lg font-semibold">This page does not exist</h2>
          <p className="text-sm text-muted-foreground">
            If you followed a link to a record, it may have been deleted — or it may belong to a
            different company than the one you are currently working in.
          </p>
        </div>

        <Link href="/" className="inline-block text-sm underline underline-offset-2">
          Back to the dashboard
        </Link>
      </div>
    </div>
  )
}
