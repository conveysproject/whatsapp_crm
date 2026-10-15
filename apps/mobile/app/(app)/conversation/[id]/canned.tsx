// apps/mobile/app/(app)/conversation/[id]/canned.tsx
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { setComposerDraft } from "../../../../components/chat/Composer";
import { useApi } from "../../../../lib/api-context";
import { colors, font, radius, space } from "../../../../lib/theme";

interface Canned { id: string; name: string; shortcut: string | null; content: string; category: string }

export default function CannedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const [q, setQ] = useState("");
  const list = useQuery({ queryKey: ["canned-responses"], queryFn: () => api<{ data: Canned[] }>("/canned-responses") });
  const needle = q.trim().toLowerCase();
  const items = (list.data?.data ?? [])
    .filter((c) => c.category === "general")
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.shortcut ?? "").toLowerCase().includes(needle) || c.content.toLowerCase().includes(needle));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Canned responses</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
      </View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search" accessibilityLabel="Search canned responses" style={styles.search} />
      {list.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => { setComposerDraft(id, item.content); router.back(); }} style={styles.item}>
              <Text style={styles.name}>{item.name}{item.shortcut ? `  /${item.shortcut}` : ""}</Text>
              <Text style={styles.content} numberOfLines={2}>{item.content}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{list.error ? "Couldn't load canned responses." : "No canned responses yet. Add them on the web dashboard."}</Text>}
        />
      )}
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
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  name: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  content: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, marginTop: 2 },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
});
