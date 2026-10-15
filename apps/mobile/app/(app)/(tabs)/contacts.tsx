// apps/mobile/app/(app)/(tabs)/contacts.tsx
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronDown, Plus, Search } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { OptionSheet } from "../../../components/OptionSheet";
import { Screen } from "../../../components/Screen";
import { useApi } from "../../../lib/api-context";
import { isForbidden } from "../../../lib/dashboard";
import { colors, font, radius, space } from "../../../lib/theme";

interface Row { id: string; firstName: string | null; lastName: string | null; name: string | null; phoneNumber: string; tags: string[]; leadStatus: { name: string; color: string } | null }
interface Page { data: Row[]; pagination: { next_cursor: string | null; has_more: boolean } }

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function ContactsScreen() {
  const api = useApi();
  const router = useRouter();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const [tag, setTag] = useState<string | null>(null);
  const [group, setGroup] = useState<{ id: string; title: string } | null>(null);
  const [sheet, setSheet] = useState<"tag" | "group" | null>(null);

  const list = useInfiniteQuery({
    queryKey: ["contacts", "list", query, tag, group?.id ?? null],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: "50" });
      if (query) p.set("q", query);
      if (tag) p.set("tag", tag);
      if (group) p.set("groupId", group.id);
      if (pageParam) p.set("cursor", pageParam);
      return api<Page>(`/contacts?${p.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.pagination.has_more ? last.pagination.next_cursor : undefined),
    retry: (n, e) => !isForbidden(e) && n < 1,
  });
  const tags = useQuery({ queryKey: ["contacts", "tags"], queryFn: () => api<{ data: string[] }>("/contacts/tags"), enabled: sheet === "tag" });
  const groups = useQuery({ queryKey: ["contact-groups"], queryFn: () => api<{ data: { id: string; title: string }[] }>("/contact-groups"), enabled: sheet === "group", retry: false });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Screen>
      <View style={styles.header}><Text style={styles.title} accessibilityRole="header">Contacts</Text></View>
      <View style={styles.search}>
        <Search size={18} color={colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search name, phone or email" accessibilityLabel="Search contacts" style={styles.input} autoCorrect={false} />
      </View>
      <View style={styles.filters}>
        <Pressable accessibilityRole="button" accessibilityLabel={tag ? `Tag ${tag}, change` : "Filter by tag"} onPress={() => setSheet("tag")} style={[styles.filter, tag ? styles.filterOn : null]}>
          <Text style={[styles.filterText, tag ? styles.filterTextOn : null]}>{tag ?? "All tags"}</Text><ChevronDown size={14} color={tag ? "#FFFFFF" : colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={group ? `Group ${group.title}, change` : "Filter by group"} onPress={() => setSheet("group")} style={[styles.filter, group ? styles.filterOn : null]}>
          <Text style={[styles.filterText, group ? styles.filterTextOn : null]}>{group?.title ?? "All groups"}</Text><ChevronDown size={14} color={group ? "#FFFFFF" : colors.text} />
        </Pressable>
      </View>
      {list.isLoading ? <ActivityIndicator color={colors.brand} style={{ marginTop: space.xl }} /> : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) void list.fetchNextPage(); }}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const name = [item.firstName, item.lastName].filter(Boolean).join(" ") || item.name || item.phoneNumber;
            return (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.id } })} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{item.phoneNumber}{item.tags.length ? ` · ${item.tags.join(", ")}` : ""}</Text>
                </View>
                {item.leadStatus ? <Text style={styles.lead}>{item.leadStatus.name}</Text> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{isForbidden(list.error) ? "Contacts aren't available for your role." : list.error ? "Couldn't load contacts." : "No contacts found."}</Text>}
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.brand} /> : <View style={{ height: 96 }} />}
        />
      )}
      {isForbidden(list.error) ? null : <Pressable accessibilityRole="button" accessibilityLabel="New contact" onPress={() => router.push("/contact/new")} style={styles.fab}><Plus size={24} color="#FFFFFF" /></Pressable>}
      <OptionSheet
        visible={sheet === "tag"}
        title="Filter by tag"
        options={[{ label: "All tags", value: "" }, ...(tags.data?.data ?? []).map((t) => ({ label: t, value: t }))]}
        onSelect={(v) => setTag(v || null)}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === "group"}
        title="Filter by group"
        options={[{ label: "All groups", value: "" }, ...(groups.data?.data ?? []).map((g) => ({ label: g.title, value: g.id }))]}
        onSelect={(v) => setGroup(v ? (groups.data?.data ?? []).find((g) => g.id === v) ?? null : null)}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, paddingTop: space.md },
  title: { fontFamily: font.bold, fontSize: 28, color: colors.text },
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginTop: space.sm, height: 44, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: space.md },
  input: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.text },
  filters: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  filter: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: space.lg, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  filterOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { fontFamily: font.semibold, fontSize: 13, color: colors.text },
  filterTextOn: { color: "#FFFFFF" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 60, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  name: { fontFamily: font.semibold, fontSize: 16, color: colors.text },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  lead: { fontFamily: font.semibold, fontSize: 12, color: colors.text, backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
  fab: { position: "absolute", right: space.xl, bottom: space.xl, width: 56, height: 56, borderRadius: 18, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", elevation: 4 },
});
