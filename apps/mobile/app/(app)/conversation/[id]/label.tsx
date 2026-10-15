import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../../lib/api-context";
import { keys, type ConversationItem, type ConversationLabel } from "../../../../lib/conversations";
import { colors, font, space } from "../../../../lib/theme";

export default function LabelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const current = qc.getQueryData<ConversationItem>(keys.detail(id))?.label ?? null;
  const [error, setError] = useState<string | null>(null);
  const labels = useQuery({ queryKey: ["inbox-labels"], queryFn: () => api<{ data: ConversationLabel[] }>("/inbox-labels") });

  const done = () => { void qc.invalidateQueries({ queryKey: ["conversations"] }); router.back(); };
  const setLabel = useMutation({
    mutationFn: (name: string) => api(`/conversations/${id}/label`, { method: "PUT", body: { name } }),
    onSuccess: done,
    onError: () => setError("Couldn't set the label. Try again."),
  });
  const clearLabel = useMutation({
    mutationFn: () => api(`/conversations/${id}/label`, { method: "DELETE" }),
    onSuccess: done,
    onError: () => setError("Couldn't clear the label. Try again."),
  });
  const busy = setLabel.isPending || clearLabel.isPending;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Inbox label</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
      </View>
      {labels.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={labels.data?.data ?? []}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: current?.id === item.id, disabled: busy }} disabled={busy} onPress={() => setLabel.mutate(item.name)} style={styles.item}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={styles.name}>{item.name}</Text>
              {current?.id === item.id ? <Text style={styles.current}>Current</Text> : null}
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{labels.error ? "Couldn't load labels." : "No inbox labels yet. Create them on the web dashboard."}</Text>}
        />
      )}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {current ? (
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => clearLabel.mutate()} style={styles.clear}>
          <Text style={styles.clearText}>Remove label</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.sm },
  title: { flex: 1, fontFamily: font.bold, fontSize: 18, color: colors.text },
  close: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.sm },
  closeText: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
  item: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 52 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.text },
  current: { fontFamily: font.semibold, fontSize: 12, color: colors.brand },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger, paddingHorizontal: space.lg },
  clear: { margin: space.lg, minHeight: 48, alignItems: "center", justifyContent: "center" },
  clearText: { fontFamily: font.semibold, fontSize: 15, color: colors.danger },
});
