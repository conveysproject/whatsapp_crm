import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Bell, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { ConversationRow } from "../../../components/inbox/ConversationRow";
import { FilterBar } from "../../../components/inbox/FilterBar";
import { Screen } from "../../../components/Screen";
import { useApi } from "../../../lib/api-context";
import { applyQuickFilter, keys, listPath, PAGE_SIZE, type ConversationItem, type ConversationLabel, type InboxTab, type QuickFilter } from "../../../lib/conversations";
import { useMe } from "../../../lib/me-context";
import { colors, font, radius, space } from "../../../lib/theme";

interface UserRow { id: string; fullName: string }

export default function InboxScreen() {
  const api = useApi();
  const me = useMe();
  const router = useRouter();
  const [tab, setTab] = useState<InboxTab>("all");
  const [quick, setQuick] = useState<QuickFilter | null>(null);
  const [label, setLabel] = useState<ConversationLabel | null>(null);
  const [labelPicker, setLabelPicker] = useState(false);
  const [q, setQ] = useState("");
  const searching = q.trim().length >= 2;

  const list = useInfiniteQuery({
    queryKey: keys.list(tab, label?.id ?? null),
    queryFn: ({ pageParam }) => api<{ data: ConversationItem[] }>(listPath(tab, label?.id ?? null, pageParam)),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.data.length === PAGE_SIZE ? pages.length + 1 : undefined),
    enabled: !searching,
  });
  const search = useQuery({
    queryKey: keys.search(q.trim()),
    queryFn: () => api<{ data: ConversationItem[] }>(`/conversations/search?q=${encodeURIComponent(q.trim())}`),
    enabled: searching,
  });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ data: UserRow[] }>("/users"), staleTime: 5 * 60_000 });
  const labels = useQuery({ queryKey: ["inbox-labels"], queryFn: () => api<{ data: ConversationLabel[] }>("/inbox-labels"), enabled: labelPicker });

  const items = useMemo(() => {
    const raw = searching ? search.data?.data ?? [] : list.data?.pages.flatMap((p) => p.data) ?? [];
    return searching ? raw : applyQuickFilter(raw, quick, me.id);
  }, [searching, search.data, list.data, quick, me.id]);

  const nameOf = (id: string | null) => (id === null ? "Unassigned" : id === me.id ? "You" : users.data?.data.find((u) => u.id === id)?.fullName ?? "Assigned");
  const now = Date.now();
  const loading = searching ? search.isLoading : list.isLoading;
  const error = searching ? search.error : list.error;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Inbox</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push("/notifications")} style={styles.iconBtn}>
          <Bell size={22} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.search}>
        <Search size={18} color={colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search conversations…" accessibilityLabel="Search conversations" style={styles.searchInput} autoCorrect={false} />
      </View>
      {!searching && (
        <FilterBar tab={tab} onTab={setTab} quick={quick} onQuick={setQuick} labelName={label?.name ?? null} onLabelPress={() => setLabelPicker((v) => !v)} />
      )}
      {labelPicker && !searching && (
        <View style={styles.labelList}>
          <Pressable accessibilityRole="button" onPress={() => { setLabel(null); setLabelPicker(false); }} style={styles.labelItem}><Text style={styles.labelText}>All labels</Text></Pressable>
          {(labels.data?.data ?? []).map((l) => (
            <Pressable key={l.id} accessibilityRole="button" onPress={() => { setLabel(l); setLabelPicker(false); }} style={styles.labelItem}>
              <View style={[styles.dot, { backgroundColor: l.color }]} /><Text style={styles.labelText}>{l.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {loading ? (
        <ActivityIndicator style={{ marginTop: space.xl }} color={colors.brand} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Couldn't load conversations.</Text>
          <Pressable accessibilityRole="button" onPress={() => void (searching ? search.refetch() : list.refetch())}><Text style={styles.link}>Try again</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ConversationRow item={item} assigneeName={nameOf(item.assignedTo)} now={now} onPress={() => router.push({ pathname: "/conversation/[id]", params: { id: item.id } })} />}
          onEndReached={() => { if (!searching && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage(); }}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={!searching && list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand} />}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{searching ? "No matches." : "No conversations here."}</Text></View>}
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.brand} /> : null}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.xl, paddingTop: space.md },
  title: { flex: 1, fontFamily: font.bold, fontSize: 28, color: colors.text },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginVertical: space.sm, height: 42, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: space.md },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.text },
  labelList: { marginHorizontal: space.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  labelItem: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44, paddingHorizontal: space.md },
  labelText: { fontFamily: font.medium, fontSize: 15, color: colors.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  empty: { alignItems: "center", padding: space.xl, gap: space.sm },
  emptyText: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted },
  link: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
});
