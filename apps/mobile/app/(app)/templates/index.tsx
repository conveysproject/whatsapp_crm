// apps/mobile/app/(app)/templates/index.tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../lib/api-context";
import { formatCount, isForbidden } from "../../../lib/dashboard";
import { colors, font, radius, space } from "../../../lib/theme";

interface Template { id: string; name: string; category: string; language: string; status: string; qualityScore: string | null; rejectedReason: string | null }
interface Stat { templateId: string; sent: number; deliveryRate: number | null; readRate: number | null }
type Filter = "all" | "approved" | "pending" | "rejected";
const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  approved: { label: "Approved", bg: "#DCFCE7", fg: "#166534" },
  pending: { label: "Pending", bg: "#FEF3C7", fg: "#92400E" },
  rejected: { label: "Rejected", bg: "#FEE2E2", fg: "#991B1B" },
  paused: { label: "Paused", bg: "#F3F4F6", fg: "#374151" },
  disabled: { label: "Disabled", bg: "#F3F4F6", fg: "#374151" },
};

export default function TemplatesScreen() {
  const api = useApi();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const list = useQuery({ queryKey: ["templates"], queryFn: () => api<{ data: Template[] }>("/templates"), retry: (n, e) => !isForbidden(e) && n < 1 });
  const stats = useQuery({ queryKey: ["templates", "stats", "30d"], queryFn: () => api<{ data: Stat[] }>("/templates/stats?range=30d"), retry: false });
  const byId = useMemo(() => new Map((stats.data?.data ?? []).map((s) => [s.templateId, s])), [stats.data]);
  const items = (list.data?.data ?? []).filter((t) => filter === "all" || t.status === filter);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.title} accessibilityRole="header">Templates</Text>
        <View style={styles.icon} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
        {(["all", "approved", "pending", "rejected"] as const).map((f) => (
          <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: filter === f }} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipOn]}>
            <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>{f === "all" ? "All" : STATUS[f]!.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {list.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={items}
          refreshControl={<RefreshControl refreshing={list.isRefetching || stats.isRefetching} onRefresh={() => { void list.refetch(); void stats.refetch(); }} />}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          renderItem={({ item }) => {
            const st = STATUS[item.status] ?? { label: item.status, bg: "#F3F4F6", fg: "#374151" };
            const s = byId.get(item.id);
            return (
              <View style={styles.card}>
                <View style={styles.line}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.status, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>
                </View>
                <Text style={styles.meta}>{item.category} · {item.language}{item.qualityScore ? ` · Quality: ${item.qualityScore}` : ""}</Text>
                {item.status === "rejected" && item.rejectedReason ? (
                  <View style={styles.reject}><Text style={styles.rejectText}>Rejected reason: {item.rejectedReason}. Edit and resubmit on the web dashboard.</Text></View>
                ) : null}
                {item.status === "approved" && s ? (
                  <View style={styles.stats}>
                    <View style={styles.stat}><Text style={styles.statLabel}>Sent (30 days)</Text><Text style={styles.statValue}>{formatCount(s.sent)}</Text></View>
                    <View style={styles.stat}><Text style={styles.statLabel}>Delivery rate</Text><Text style={styles.statValue}>{s.deliveryRate === null ? "—" : `${Math.round(s.deliveryRate)}%`}</Text></View>
                    <View style={styles.stat}><Text style={styles.statLabel}>Read rate</Text><Text style={styles.statValue}>{s.readRate === null ? "—" : `${Math.round(s.readRate)}%`}</Text></View>
                  </View>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={isForbidden(list.error) ? <Text style={styles.empty}>Templates aren't available for your role.</Text> : list.error ? (
            <View style={{ alignItems: "center" }}>
              <Text style={styles.empty}>Couldn't load templates.</Text>
              <Pressable accessibilityRole="button" onPress={() => void list.refetch()} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: space.lg }}><Text style={{ fontFamily: font.semibold, fontSize: 15, color: colors.brand }}>Try again</Text></Pressable>
            </View>
          ) : <Text style={styles.empty}>No templates here.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  head: { flexDirection: "row", alignItems: "center" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 16, color: colors.text },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  chip: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, justifyContent: "center" },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: colors.text },
  chipTextOn: { color: "#FFFFFF" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { flex: 1, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 14, color: colors.text },
  status: { fontFamily: font.semibold, fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  reject: { backgroundColor: "#FEF2F2", borderRadius: radius.sm, padding: space.md },
  rejectText: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: "#7F1D1D" },
  stats: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#F3F4F6", paddingTop: space.sm },
  stat: { flex: 1 },
  statLabel: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted },
  statValue: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
});
