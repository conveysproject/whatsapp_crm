import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../lib/api-context";
import { colors, font, space } from "../../lib/theme";

interface Canned { id: string; name: string; shortcut: string | null; content: string; category: string }

export default function CannedResponsesScreen() {
  const api = useApi();
  const router = useRouter();
  const list = useQuery({ queryKey: ["canned-responses"], queryFn: () => api<{ data: Canned[] }>("/canned-responses") });
  const items = (list.data?.data ?? []).filter((c) => c.category === "general");
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.title} accessibilityRole="header">Canned responses</Text>
        <View style={styles.icon} />
      </View>
      {list.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={styles.name}>{item.name}{item.shortcut ? `  /${item.shortcut}` : ""}</Text>
              <Text style={styles.content}>{item.content}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{list.error ? "Couldn't load canned responses." : "No canned responses yet."}</Text>}
          ListFooterComponent={<Text style={styles.note}>Add or edit canned responses on the web dashboard. Use them in a chat from the + menu.</Text>}
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
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  name: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  content: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, marginTop: 2 },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
  note: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, textAlign: "center", padding: space.xl },
});
