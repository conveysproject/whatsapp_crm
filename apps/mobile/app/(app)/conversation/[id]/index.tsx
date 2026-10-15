import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChatHeader } from "../../../../components/chat/ChatHeader";
import { Composer } from "../../../../components/chat/Composer";
import { OptionSheet } from "../../../../components/OptionSheet";
import { MessageBubble } from "../../../../components/chat/MessageBubble";
import { getActiveConversation, setActiveConversation } from "../../../../lib/active-conversation";
import { ApiError } from "../../../../lib/api";
import { useApi } from "../../../../lib/api-context";
import { keys, windowHoursLeft, type ChatMessage, type ConversationItem, type ConversationStatus } from "../../../../lib/conversations";
import { useMe } from "../../../../lib/me-context";
import { colors, font, space } from "../../../../lib/theme";

interface UserRow { id: string; fullName: string }

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();

  const conv = useQuery({ queryKey: keys.detail(id), queryFn: async () => (await api<{ data: ConversationItem }>(`/conversations/${id}`)).data });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ data: UserRow[] }>("/users"), staleTime: 5 * 60_000 });
  const thread = useInfiniteQuery({
    queryKey: keys.messages(id),
    queryFn: ({ pageParam }) => api<{ data: ChatMessage[]; pagination: { hasMore: boolean; nextCursor: string | null } }>(
      `/conversations/${id}/messages${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.pagination.hasMore ? last.pagination.nextCursor : undefined),
  });

  // Newest first for an inverted list: page 0 is the newest page (ascending inside), later pages are older.
  const messages = useMemo(() => (thread.data?.pages ?? []).flatMap((p) => [...p.data].reverse()), [thread.data]);
  const newestInboundId = messages.find((m) => m.direction === "inbound")?.id ?? null;

  useFocusEffect(useCallback(() => {
    setActiveConversation(id);
    // Only clear if still ours: chat A -> B focus can run before A's blur.
    return () => { if (getActiveConversation() === id) setActiveConversation(null); };
  }, [id]));

  const hasConversation = !!conv.data;
  useEffect(() => {
    if (!hasConversation) return;
    void api(`/conversations/${id}/read`, { method: "POST" })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["unread-count"] });
        void qc.invalidateQueries({ queryKey: ["conversations", "list"] });
      })
      .catch(() => undefined);
  }, [api, id, qc, hasConversation, newestInboundId]);

  const setStatus = useMutation({
    mutationFn: (status: ConversationStatus) => api(`/conversations/${id}/status`, { method: "POST", body: { status } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["conversations"] }),
    onError: () => Alert.alert("Couldn't change the status", "Check your connection and try again."),
  });

  const [statusOpen, setStatusOpen] = useState(false);
  const statusOptions = [
    { label: "Open", value: "open" },
    { label: "Pending", value: "pending" },
    { label: "Resolved", value: "resolved" },
  ];

  if (conv.isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (conv.error && !conv.data) {
    const noAccess = conv.error instanceof ApiError && conv.error.status === 404;
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.stateTitle}>{noAccess ? "You don't have access to this chat" : "Couldn't load this chat"}</Text>
        <Text style={styles.stateBody}>{noAccess ? "It may have been reassigned, or it's outside your team." : "Check your connection and try again."}</Text>
        <Pressable accessibilityRole="button" onPress={() => (noAccess ? router.back() : void conv.refetch())} style={styles.stateBtn}>
          <Text style={styles.stateBtnText}>{noAccess ? "Back" : "Try again"}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  if (!conv.data) return null;
  const c = conv.data;
  const assigneeName = c.assignedTo === null ? "Unassigned" : c.assignedTo === me.id ? "You" : users.data?.data.find((u) => u.id === c.assignedTo)?.fullName ?? "Assigned";
  const hours = windowHoursLeft(c.lastInboundAt, Date.now());

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ChatHeader
        c={c}
        assigneeName={assigneeName}
        onBack={() => router.back()}
        onContact={() => { if (c.contact) router.push({ pathname: "/contact/[id]", params: { id: c.contact.id } }); }}
        onStatus={() => setStatusOpen(true)}
        onAssign={() => router.push({ pathname: "/conversation/[id]/assign", params: { id } })}
        onLabel={() => router.push({ pathname: "/conversation/[id]/label", params: { id } })}
      />
      <View style={[styles.window, c.serviceWindowActive ? styles.windowOpen : styles.windowClosed]}>
        <Text style={[styles.windowText, { color: c.serviceWindowActive ? colors.brandDark : colors.warning }]}>
          {c.serviceWindowActive ? `24-hour window open${hours !== null ? ` · ${hours}h left` : ""}` : "24-hour window closed. Send an approved template to restart."}
        </Text>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble m={item} />}
          onEndReached={() => { if (thread.hasNextPage && !thread.isFetchingNextPage) void thread.fetchNextPage(); }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={thread.isFetchingNextPage ? <ActivityIndicator color={colors.brand} /> : null}
          style={styles.thread}
          contentContainerStyle={{ paddingVertical: space.sm }}
        />
        <Composer conversation={c} />
      </KeyboardAvoidingView>
      <OptionSheet
        visible={statusOpen}
        title="Conversation status"
        options={statusOptions}
        onSelect={(v) => setStatus.mutate(v as ConversationStatus)}
        onClose={() => setStatusOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  thread: { flex: 1, backgroundColor: colors.chatBackground },
  window: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  windowOpen: { backgroundColor: "#F0FDF4" },
  windowClosed: { backgroundColor: colors.warningSoft },
  windowText: { fontFamily: font.medium, fontSize: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md, backgroundColor: colors.surface },
  stateTitle: { fontFamily: font.bold, fontSize: 18, color: colors.text, textAlign: "center" },
  stateBody: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center" },
  stateBtn: { minHeight: 48, paddingHorizontal: space.xl, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  stateBtnText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
});
