/**
 * Accounts that are the same venue entered twice.
 *
 * Two rows for one customer is not merely untidy. History splits across them,
 * and every judgement built on history is made on half the evidence: Bella
 * Napoli has four orders and two accounts of two, so neither row clears the
 * three-order threshold that lapse detection needs, and a venue that has been
 * ordering steadily for months cannot appear in a report about venues that have
 * stopped. Credit exposure divides the same way, and a rep opening one of the
 * two sees a quieter customer than they have.
 *
 * Detection only. Merging accounts moves orders, invoices and money between
 * rows, and which row survives is a judgement about which one people have been
 * using — not something to infer and do quietly.
 */

/** Trim the things that make two spellings of one name look different. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    /**
     * Apostrophes and dots are removed rather than turned into spaces, because
     * they join a word rather than separating one. Replacing them wholesale
     * makes "Tony's" into "tony s" while "TONYS" stays "tonys", so the two
     * spellings of one venue stop matching — which is exactly the case this
     * function exists to catch. Dotted acronyms fail the same way: "P.F.D."
     * becomes "p f d" and no longer matches "PFD".
     */
    .replace(/['’.]/g, "")
    .replace(/\b(pty|ltd|limited|inc|incorporated|co|company|group|holdings|australia|au)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export interface AccountLike {
  id: string
  name: string
  orderCount: number
  invoiceCount: number
}

export interface DuplicateGroup {
  normalised: string
  accounts: AccountLike[]
  totalOrders: number
  /**
   * True when splitting the history is actively hiding the account from lapse
   * detection: combined they clear the threshold, separately none of them do.
   */
  hiddenFromLapseDetection: boolean
}

/** The order history lapse detection needs before it will judge an account. */
export const LAPSE_THRESHOLD = 3

export function findDuplicateAccounts(
  accounts: AccountLike[],
  threshold = LAPSE_THRESHOLD
): DuplicateGroup[] {
  const groups = new Map<string, AccountLike[]>()

  for (const account of accounts) {
    const key = normaliseName(account.name)
    // A name that normalises to nothing cannot be compared with anything.
    if (!key) continue

    const list = groups.get(key) ?? []
    list.push(account)
    groups.set(key, list)
  }

  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([normalised, list]) => {
      const totalOrders = list.reduce((sum, account) => sum + account.orderCount, 0)

      return {
        normalised,
        accounts: list,
        totalOrders,
        hiddenFromLapseDetection:
          totalOrders >= threshold && list.every((account) => account.orderCount < threshold),
      }
    })
    .sort((a, b) => b.totalOrders - a.totalOrders)
}

/** One line a person can act on. */
export function describeDuplicate(group: DuplicateGroup): string {
  const name = group.accounts[0].name
  const split = group.accounts.map((a) => a.orderCount).join(" + ")

  const consequence = group.hiddenFromLapseDetection
    ? ` Split ${split}, so no single account reaches the ${LAPSE_THRESHOLD} orders lapse detection needs — this venue cannot appear in a going-quiet report at all.`
    : ` Their ${group.totalOrders} orders are split ${split} across the accounts.`

  return `"${name}" exists as ${group.accounts.length} accounts.${consequence}`
}
