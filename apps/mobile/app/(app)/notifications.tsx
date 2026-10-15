import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Clock, MessageSquare, UserPlus, ChevronLeft } from "lucide-react-native";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../lib/api-context";
import { relativeTime, routeForNotificationAction, type FeedItem } from "../../lib/notifications-feed";
import { colors, font, space } from "../../lib/theme";

const ICON = { new_message: MessageSquare, conversation_assigned: UserPlus, closure_overdue: Clock } as const;

export default function NotificationsScreen() {
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const feed = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ data: FeedItem[]; unreadCount: number }>("/notifications") });
  const readAll = useMutation({ mutationFn: () => api("/notifications/read-all", { method: "PUT" }), onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }) });
  const now = Date.now();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.title} accessibilityRole="header">Notifications</Text>
        <Pressable accessibilityRole="button" disabled={readAll.isPending || !feed.data?.unreadCount} onPress={() => readAll.mutate()} style={styles.readAll}>
          <Text style={[styles.readAllText, !feed.data?.unreadCount && { opacity: 0.4 }]}>Mark all read</Text>
        </Pressable>
      </View>
      {feed.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={feed.data?.data ?? []}
          keyExtractor={(n) => n.id}
          refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const to = routeForNotificationAction(item.type, item.action);
            const Icon = ICON[item.type as keyof typeof ICON] ?? MessageSquare;
            const unread = item.readAt === null;
            return (
              <Pressable accessibilityRole={to ? "button" : "text"} disabled={!to} onPress={() => to && router.push(to as never)} style={[styles.row, unread && styles.unread]}>
                <View style={styles.badge}><Icon size={20} color={colors.brandDark} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.msg, unread && styles.msgUnread]}>{item.message ?? "Notification"}</Text>
                  <Text style={styles.time}>{relativeTime(item.createdAt, now)}</Text>
                </View>
                {unread ? <View accessibilityLabel="Unread" style={styles.dot} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{feed.error ? "Couldn't load notifications." : "You're all caught up."}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: font.bold, fontSize: 18, color: colors.text },
  readAll: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.md },
  readAllText: { fontFamily: font.semibold, fontSize: 14, color: colors.brand },
  row: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  unread: { backgroundColor: "#F0FDF4" },
  badge: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" },
  msg: { fontFamily: font.regular, fontSize: 15, color: colors.text },
  msgUnread: { fontFamily: font.semibold },
  time: { fontFamily: font.regular, fontSize: 12, color: colors.textSubtle, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand, marginTop: 6 },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
});
