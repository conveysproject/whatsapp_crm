import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../../lib/api-context";
import { keys, type ConversationItem } from "../../../../lib/conversations";
import { useMe } from "../../../../lib/me-context";
import { colors, font, radius, space } from "../../../../lib/theme";

interface UserRow { id: string; fullName: string; email: string; role: string }
const ROLE: Record<string, string> = { admin: "Admin", manager: "Manager", agent: "Agent", viewer: "Viewer" };

export default function AssignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const conv = qc.getQueryData<ConversationItem>(keys.detail(id));
  const [picked, setPicked] = useState<string | null>(conv?.assignedTo ?? null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  // /users can 403 for some roles, so don't retry: show the "Couldn't load your team." state instead.
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ data: UserRow[] }>("/users"), staleTime: 5 * 60_000, retry: false });
  const needle = q.trim().toLowerCase();
  const list = (users.data?.data ?? []).filter((u) => u.role !== "superAdmin" && (!needle || u.fullName.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)));

  const assign = useMutation({
    mutationFn: (assignedTo: string | null) => api(`/conversations/${id}/assign`, { method: "POST", body: { assignedTo } }),
    onMutate: () => setError(null),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["conversations"] }); void qc.invalidateQueries({ queryKey: ["unread-count"] }); router.back(); },
    onError: () => setError("Couldn't assign. The person may no longer be active — refresh and try again."),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Assign to</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
      </View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search agents…" accessibilityLabel="Search agents" style={styles.search} />
      {users.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={list}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => {
            const on = picked === item.id;
            return (
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setPicked(item.id)} style={[styles.item, on && styles.itemOn]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.fullName}{item.id === me.id ? " (you)" : ""}</Text>
                  <Text style={styles.meta}>{ROLE[item.role] ?? item.role} · {item.email}</Text>
                </View>
                <View style={[styles.radio, on && styles.radioOn]} />
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{users.error ? "Couldn't load your team." : "No one matches."}</Text>}
        />
      )}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={assign.isPending} onPress={() => assign.mutate(null)} style={styles.secondary}><Text style={styles.secondaryText}>Unassign</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!picked || assign.isPending} onPress={() => picked && assign.mutate(picked)} style={[styles.primary, (!picked || assign.isPending) && styles.disabled]}>
          {assign.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Assign</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.sm },
  title: { flex: 1, fontFamily: font.bold, fontSize: 18, color: colors.text },
  close: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.sm },
  closeText: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
  search: { marginHorizontal: space.lg, marginBottom: space.sm, height: 42, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: space.md, fontFamily: font.regular, fontSize: 15 },
  item: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 60 },
  itemOn: { backgroundColor: "#F0FDF4" },
  name: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#9CA3AF" },
  radioOn: { borderWidth: 7, borderColor: colors.brand },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger, paddingHorizontal: space.lg },
  actions: { flexDirection: "row", gap: space.md, padding: space.lg },
  secondary: { flex: 1, height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  primary: { flex: 2, height: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: font.semibold, fontSize: 15, color: "#FFFFFF" },
  disabled: { opacity: 0.5 },
});
