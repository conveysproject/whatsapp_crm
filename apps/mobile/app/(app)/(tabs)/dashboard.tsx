// apps/mobile/app/(app)/(tabs)/dashboard.tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Bell, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../../components/Screen";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { useApi } from "../../../lib/api-context";
import { attentionRoute, deltaText, formatCount, formatDuration, isForbidden, pct, standingBanner, type DashboardData, type Range, type Standing } from "../../../lib/dashboard";
import { useMe } from "../../../lib/me-context";
import { colors, font, radius, space } from "../../../lib/theme";

interface Usage { billable: number; plan: { published: boolean; freeAllowance: number; current?: { name: string; inr: number | null; usd: number | null } } | null; cycle: { toExclusive: string } | null }

const TONE = { good: colors.brand, bad: colors.danger, flat: colors.textMuted } as const;

export default function DashboardScreen() {
  const api = useApi();
  const me = useMe();
  const router = useRouter();
  const [range, setRange] = useState<Range>("today");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const dash = useQuery({ queryKey: ["dashboard", range], queryFn: async () => (await api<{ data: DashboardData }>(`/analytics/dashboard?range=${range}&tz=${encodeURIComponent(tz)}`)).data, retry: (n, e) => !isForbidden(e) && n < 1 });
  const standing = useQuery({ queryKey: ["billing-standing"], queryFn: async () => (await api<{ data: Standing }>("/billing/standing")).data, staleTime: 5 * 60_000 });
  const usage = useQuery({ queryKey: ["billing-usage"], queryFn: async () => (await api<{ data: Usage }>("/billing/message-usage")).data, retry: false, staleTime: 5 * 60_000 });
  const banner = standingBanner(standing.data);
  const k = dash.data?.kpis ?? null;
  const funnel = dash.data?.campaignFunnel ?? null;
  const attention = dash.data?.attention ?? [];

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>Hello, {me.fullName.split(" ")[0]}</Text>
          <Text style={styles.title} accessibilityRole="header">Dashboard</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push("/notifications")} style={styles.icon}><Bell size={22} color={colors.text} /></Pressable>
      </View>
      <View style={styles.subnav}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/campaigns")} style={styles.sub}><Text style={styles.subText}>Campaigns</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/templates")} style={styles.sub}><Text style={styles.subText}>Templates</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={dash.isRefetching} onRefresh={() => { void dash.refetch(); void standing.refetch(); void usage.refetch(); }} tintColor={colors.brand} />}>
        {banner ? (
          <View style={[styles.banner, banner.tone === "danger" ? styles.bannerDanger : styles.bannerWarn]} accessibilityRole="alert">
            <Text style={styles.bannerTitle}>{banner.title}</Text>
            <Text style={styles.bannerBody}>{banner.body}</Text>
          </View>
        ) : null}

        <SegmentedControl accessibilityLabel="Range" value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }]} />

        {dash.isLoading ? <ActivityIndicator color={colors.brand} /> : isForbidden(dash.error) ? (
          <View style={styles.card}><Text style={styles.muted}>The dashboard isn't available for your role.</Text></View>
        ) : dash.error && !dash.data ? (
          <View style={styles.card}>
            <Text style={styles.muted}>Couldn't load the dashboard.</Text>
            <Pressable accessibilityRole="button" onPress={() => void dash.refetch()} style={styles.retry}><Text style={styles.link}>Try again</Text></Pressable>
          </View>
        ) : (
          <>
            {attention.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Needs attention</Text>
                {attention.map((a) => {
                  const to = attentionRoute(a.href);
                  return (
                    <Pressable key={a.key} accessibilityRole={to ? "button" : "text"} disabled={!to} onPress={() => to && router.push(to as never)} style={styles.attRow}>
                      <View style={[styles.dot, { backgroundColor: a.severity === "critical" ? colors.danger : "#D97706" }]} />
                      <Text style={styles.attLabel}>{a.label}</Text>
                      <Text style={styles.attCount}>{formatCount(a.count)}</Text>
                      {to ? <ChevronRight size={16} color={colors.textSubtle} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {k ? (
              <View style={styles.grid}>
                <View style={styles.kpi}><Text style={styles.kl}>Messages</Text><Text style={styles.kv}>{formatCount(k.messages.value)}</Text><Text style={styles.kd}>{formatCount(k.messages.inbound)} in / {formatCount(k.messages.outbound)} out</Text></View>
                <View style={styles.kpi}><Text style={styles.kl}>Open conversations</Text><Text style={styles.kv}>{formatCount(k.openConversations.value)}</Text><Text style={styles.kd}>right now</Text></View>
                {([["New conversations", k.newConversations, false], ["New contacts", k.newContacts, false], ["Campaigns sent", k.campaignsSent, false]] as const).map(([label, v, low]) => {
                  const d = deltaText(v, low);
                  return <View key={label} style={styles.kpi}><Text style={styles.kl}>{label}</Text><Text style={styles.kv}>{formatCount(v.value)}</Text>{d ? <Text style={[styles.kd, { color: TONE[d.tone] }]}>{d.text}</Text> : null}</View>;
                })}
                {(() => { const d = deltaText(k.firstReplySecs, true); return (
                  <View style={styles.kpi}><Text style={styles.kl}>Avg time to first reply</Text><Text style={styles.kv}>{formatDuration(k.firstReplySecs.value)}</Text>{d ? <Text style={[styles.kd, { color: TONE[d.tone] }]}>{d.text}</Text> : null}</View>
                ); })()}
              </View>
            ) : null}

            {funnel ? (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/campaigns/[id]", params: { id: funnel.id } })} style={styles.card}>
                <Text style={styles.cardTitle}>Last campaign</Text>
                <Text style={styles.campName}>{funnel.name}</Text>
                {([["Delivered", funnel.delivered, colors.brand], ["Read", funnel.read, "#2563EB"], ["Failed", funnel.failed, colors.danger]] as const).map(([label, n, c]) => (
                  <View key={label} style={styles.barRow}>
                    <Text style={styles.barLabel}>{label}</Text>
                    <View style={styles.bar}><View style={[styles.barFill, { width: `${pct(n, funnel.sent)}%`, backgroundColor: c }]} /></View>
                    <Text style={styles.barPct}>{pct(n, funnel.sent)}%</Text>
                  </View>
                ))}
              </Pressable>
            ) : null}
          </>
        )}

        {usage.data ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Message usage · this cycle</Text>
            <Text style={styles.big}>{formatCount(usage.data.billable)} <Text style={styles.muted}>billable messages</Text></Text>
            {usage.data.plan ? (
              <Text style={styles.muted}>
                Free {formatCount(usage.data.plan.freeAllowance)}
                {usage.data.plan.published && usage.data.plan.current ? ` · ${usage.data.plan.current.name}` : ""}
                {usage.data.cycle ? ` · cycle ends ${new Date(usage.data.cycle.toExclusive).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.xl, paddingTop: space.md },
  hello: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  title: { fontFamily: font.bold, fontSize: 28, color: colors.text },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  subnav: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  sub: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: "center" },
  subText: { fontFamily: font.semibold, fontSize: 13, color: colors.text },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxl, backgroundColor: colors.background },
  banner: { borderRadius: radius.lg, padding: space.lg, gap: 4, borderWidth: 1 },
  bannerWarn: { backgroundColor: colors.warningSoft, borderColor: "#FCD34D" },
  bannerDanger: { backgroundColor: colors.dangerSoft, borderColor: "#FCA5A5" },
  bannerTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  bannerBody: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  cardTitle: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  attRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  attLabel: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.text },
  attCount: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  kpi: { width: "47%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: 2 },
  kl: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  kv: { fontFamily: font.bold, fontSize: 22, color: colors.text },
  kd: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted },
  campName: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  barLabel: { width: 70, fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  bar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  barPct: { width: 40, textAlign: "right", fontFamily: font.bold, fontSize: 13, color: colors.text },
  big: { fontFamily: font.bold, fontSize: 24, color: colors.text },
  muted: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  retry: { minHeight: 44, justifyContent: "center" },
  link: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
});
