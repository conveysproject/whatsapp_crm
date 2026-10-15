// apps/mobile/app/(app)/campaigns/index.tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../lib/api-context";
import { statusStyle, type Campaign } from "../../../lib/campaigns";
import { isForbidden } from "../../../lib/dashboard";
import { colors, font, space } from "../../../lib/theme";

export default function CampaignsScreen() {
  const api = useApi();
  const router = useRouter();
  const list = useQuery({ queryKey: ["campaigns", "list"], queryFn: async () => (await api<{ data: Campaign[] }>("/campaigns")).data, retry: (n, e) => !isForbidden(e) && n < 1 });
  const items = (list.data ?? []).filter((c) => !c.isArchived);
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.title} accessibilityRole="header">Campaigns</Text>
        <View style={styles.icon} />
      </View>
      {list.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const st = statusStyle(item.displayStatus);
            const when = item.sentAt ?? item.scheduledAt ?? item.createdAt;
            return (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/campaigns/[id]", params: { id: item.id } })} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.meta}>{new Date(when).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Text>
                </View>
                <Text style={[styles.chip, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{isForbidden(list.error) ? "Campaigns aren't available for your role." : list.error ? "Couldn't load campaigns." : "No campaigns yet. Create them on the web dashboard."}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 16, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 64, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  name: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  chip: { fontFamily: font.semibold, fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
});
