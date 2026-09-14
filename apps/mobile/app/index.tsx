import { useCallback, useEffect, useState } from "react"
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native"
import { Link } from "expo-router"

import { useQueue } from "@/hooks/use-queue"
import { useRun } from "@/hooks/use-run"

/**
 * The run.
 *
 * Shows cached stops when there is no signal rather than an error, because a
 * driver in a dead spot still needs to know where they are going. The banner
 * says plainly how much work is waiting to sync — a silent queue is how people
 * stop trusting an app.
 */
export default function RunScreen() {
  const { stops, loading, offline, refresh } = useRun()
  const { pending, failed, flush } = useQueue()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([refresh(), flush()])
    setRefreshing(false)
  }, [refresh, flush])

  useEffect(() => {
    // Try to drain whenever the screen is shown; signal usually comes back
    // while driving rather than while looking at the phone.
    flush()
  }, [flush])

  return (
    <View style={styles.screen}>
      {(offline || pending > 0 || failed > 0) && (
        <View style={[styles.banner, failed > 0 ? styles.bannerBad : styles.bannerWarn]}>
          <Text style={styles.bannerText}>
            {failed > 0
              ? `${failed} update${failed === 1 ? "" : "s"} could not be sent — tap to review`
              : offline
                ? `Offline${pending ? ` · ${pending} waiting to send` : " · showing your last run"}`
                : `${pending} update${pending === 1 ? "" : "s"} waiting to send`}
          </Text>
        </View>
      )}

      <FlatList
        data={stops}
        keyExtractor={(stop) => stop.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading ? "Loading your run…" : "Nothing assigned to you today."}
          </Text>
        }
        renderItem={({ item, index }) => (
          <Link href={`/stop/${item.id}`} asChild>
            <Pressable style={styles.row}>
              <View style={styles.seq}>
                <Text style={styles.seqText}>{index + 1}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.customer}>{item.customerName}</Text>
                <Text style={styles.address}>{item.address}</Text>
              </View>
              <Text style={[styles.status, item.status === "delivered" && styles.statusDone]}>
                {item.status}
              </Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" },
  banner: { paddingHorizontal: 16, paddingVertical: 10 },
  bannerWarn: { backgroundColor: "#fef3c7" },
  bannerBad: { backgroundColor: "#fee2e2" },
  bannerText: { fontSize: 13, fontWeight: "600", color: "#78350f" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  seq: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  seqText: { color: "#fff", fontWeight: "700" },
  rowBody: { flex: 1 },
  customer: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  address: { fontSize: 13, color: "#64748b", marginTop: 2 },
  status: { fontSize: 12, textTransform: "uppercase", color: "#64748b" },
  statusDone: { color: "#059669", fontWeight: "700" },
  empty: { padding: 32, textAlign: "center", color: "#64748b" },
})
