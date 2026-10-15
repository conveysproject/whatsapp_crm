// apps/mobile/app/(app)/conversation/[id]/template.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../../lib/api-context";
import { keys, sendErrorMessage } from "../../../../lib/conversations";
import { trimThreadToNewestPage } from "../../../../lib/thread-refresh";
import { colors, font, radius, space } from "../../../../lib/theme";

interface Template { id: string; name: string; category: string; language: string; status: string; headerText: string | null; bodyText: string | null; footerText: string | null }

export default function TemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["templates"], queryFn: () => api<{ data: Template[] }>("/templates") });
  const approved = (list.data?.data ?? []).filter((t) => t.status === "approved");

  const send = useMutation({
    mutationFn: (t: Template) => api(`/conversations/${id}/messages`, { method: "POST", body: { contentType: "template", templateId: t.id } }),
    onMutate: () => setError(null),
    onSuccess: () => {
      trimThreadToNewestPage(qc, id);
      void qc.invalidateQueries({ queryKey: keys.messages(id) });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      router.back();
    },
    onError: (e) => setError(sendErrorMessage(e)),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Choose a template</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
      </View>
      {list.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={approved}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => {
            const on = picked?.id === item.id;
            return (
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setPicked(item)} style={[styles.item, on && styles.itemOn]}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{item.category} · {item.language}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={list.error ? (
            <View style={styles.emptyBox}>
              <Text style={styles.empty}>Couldn't load templates.</Text>
              <Pressable accessibilityRole="button" onPress={() => void list.refetch()} style={styles.retry}><Text style={styles.closeText}>Try again</Text></Pressable>
            </View>
          ) : <Text style={styles.empty}>No approved templates yet.</Text>}
        />
      )}
      {picked ? (
        <View style={styles.preview}>
          <Text style={styles.previewLabel}>Preview</Text>
          <View style={styles.bubble}>
            {picked.headerText ? <Text style={styles.bubbleHeader}>{picked.headerText}</Text> : null}
            <Text style={styles.bubbleBody}>{picked.bodyText ?? ""}</Text>
            {picked.footerText ? <Text style={styles.bubbleFooter}>{picked.footerText}</Text> : null}
          </View>
          <Text style={styles.note}>Variables like {"{{1}}"} are filled from this contact's details. Meta charges template messages, so this counts toward your monthly billable messages.</Text>
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ busy: send.isPending, disabled: send.isPending }} disabled={send.isPending} onPress={() => send.mutate(picked)} style={styles.sendBtn}>
            {send.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendText}>Send template</Text>}
          </Pressable>
        </View>
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
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", minHeight: 56 },
  itemOn: { backgroundColor: "#F0FDF4" },
  name: { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 15, color: colors.text },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
  emptyBox: { alignItems: "center" },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.lg },
  preview: { borderTopWidth: 1, borderTopColor: colors.border, padding: space.lg, gap: space.sm },
  previewLabel: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  bubble: { alignSelf: "flex-end", maxWidth: "90%", backgroundColor: colors.bubbleOut, borderRadius: 14, borderTopRightRadius: 4, padding: space.md, gap: 4 },
  bubbleHeader: { fontFamily: font.semibold, fontSize: 14, color: colors.text },
  bubbleBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.text },
  bubbleFooter: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  note: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger },
  sendBtn: { height: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  sendText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
});
