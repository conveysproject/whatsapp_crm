// apps/mobile/app/(app)/campaigns/[id].tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../lib/api-context";
import { availableActions, progress, statusStyle, type Campaign, type CampaignStats } from "../../../lib/campaigns";
import { formatCount, isForbidden } from "../../../lib/dashboard";
import { colors, font, radius, space } from "../../../lib/theme";

const ACTION_LABEL = { pause: "Pause", resume: "Resume", abort: "Abort", retry: "Retry failed" } as const;
const ACTION_PATH = { pause: "pause", resume: "resume", abort: "abort", retry: "requeue-failed" } as const;

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const campaign = useQuery({ queryKey: ["campaigns", "detail", id], queryFn: async () => (await api<{ data: Campaign }>(`/campaigns/${id}`)).data });
  const report = useQuery({ queryKey: ["campaigns", "report", id], queryFn: async () => (await api<{ data: { stats: CampaignStats } }>(`/campaigns/${id}/report`)).data.stats });

  const act = useMutation({
    mutationFn: (a: keyof typeof ACTION_PATH) => api(`/campaigns/${id}/${ACTION_PATH[a]}`, { method: "POST" }),
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campaigns"] }),
    onError: (e) => setError(isForbidden(e) ? "You don't have permission to pause, resume or abort campaigns." : "Couldn't update the campaign. Try again."),
  });

  function run(a: keyof typeof ACTION_PATH) {
    if (a !== "abort") return act.mutate(a);
    Alert.alert("Abort this campaign?", "Contacts who haven't been messaged yet won't be. This can't be undone.", [
      { text: "Keep sending", style: "cancel" },
      { text: "Abort", style: "destructive", onPress: () => act.mutate("abort") },
    ]);
  }

  if (campaign.isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (!campaign.data) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.stateTitle}>{isForbidden(campaign.error) ? "Campaigns aren't available for your role" : "Couldn't load this campaign"}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.primary}><Text style={styles.primaryText}>Back</Text></Pressable>
      </SafeAreaView>
    );
  }
  const c = campaign.data;
  const st = statusStyle(c.displayStatus);
  const s = report.data ?? null;
  const p = s ? progress(s) : null;
  const actions = availableActions(c.displayStatus, s);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.headTitle} accessibilityRole="header">Campaign</Text>
        <View style={styles.icon} />
      </View>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={report.isRefetching} onRefresh={() => { void campaign.refetch(); void report.refetch(); }} tintColor={colors.brand} />}>
        <Text style={[styles.chip, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>
        <Text style={styles.name}>{c.name}</Text>
        {p ? (
          <View style={styles.card}>
            <View style={styles.line}><Text style={styles.strong}>{formatCount(p.done)} of {formatCount(p.total)} processed</Text><Text style={styles.muted}>{p.percent}%</Text></View>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p.percent }} style={styles.bar}><View style={[styles.barFill, { width: `${p.percent}%` }]} /></View>
          </View>
        ) : null}
        {s ? (
          <View style={[styles.card, styles.grid]}>
            {([["Sent", s.sent + s.accepted], ["Delivered", s.delivered + s.played], ["Read", s.read], ["Failed", s.failed], ["Pending", s.pending], ["Expired", s.expired]] as const).map(([label, n]) => (
              <View key={label} style={styles.stat}><Text style={styles.muted}>{label}</Text><Text style={[styles.statValue, label === "Failed" && n > 0 ? { color: colors.danger } : null]}>{formatCount(n)}</Text></View>
            ))}
          </View>
        ) : report.isLoading ? <ActivityIndicator color={colors.brand} /> : null}
        <Text style={styles.note}>Create or edit campaigns on the web dashboard.</Text>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      </ScrollView>
      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable key={a} accessibilityRole="button" accessibilityState={{ busy: act.isPending, disabled: act.isPending }} disabled={act.isPending} onPress={() => run(a)} style={[styles.action, a === "abort" ? styles.danger : null]}>
              <Text style={[styles.actionText, a === "abort" ? { color: "#FFFFFF" } : null]}>{ACTION_LABEL[a]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  head: { flexDirection: "row", alignItems: "center" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 16, color: colors.text },
  body: { padding: space.lg, gap: space.md },
  chip: { alignSelf: "flex-start", fontFamily: font.semibold, fontSize: 12, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  name: { fontFamily: font.bold, fontSize: 22, color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  line: { flexDirection: "row", justifyContent: "space-between" },
  strong: { fontFamily: font.semibold, fontSize: 14, color: colors.text },
  muted: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.brand },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  stat: { width: "33%", paddingVertical: space.sm },
  statValue: { fontFamily: font.bold, fontSize: 20, color: colors.text },
  note: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, textAlign: "center" },
  error: { fontFamily: font.medium, fontSize: 14, color: colors.danger },
  actions: { flexDirection: "row", gap: space.md, padding: space.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  action: { flex: 1, minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  actionText: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl, backgroundColor: colors.surface },
  stateTitle: { fontFamily: font.bold, fontSize: 18, color: colors.text, textAlign: "center" },
  primary: { minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
});
