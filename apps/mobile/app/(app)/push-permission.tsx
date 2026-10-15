import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../lib/api-context";
import { markPushPermissionAsked, registerDevice } from "../../lib/push";
import { colors, font, radius, space } from "../../lib/theme";

const POINTS = [
  ["New messages", "in chats assigned to you"],
  ["Chats assigned", "to you by a teammate or a rule"],
  ["Lead closure reminders", "when a deadline you set is overdue"],
] as const;

export default function PushPermissionScreen() {
  const api = useApi();
  const router = useRouter();

  const { userId } = useAuth();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function done(enable: boolean) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      if (userId) await markPushPermissionAsked(userId);
      if (enable) await registerDevice(api).catch(() => null);
    } catch {
      // A storage failure must not trap the user on this screen.
    }
    router.replace("/inbox");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.icon}><Bell color={colors.brand} size={52} /></View>
      <Text style={styles.title} accessibilityRole="header">Never miss a customer</Text>
      <Text style={styles.body}>Turn on notifications so we can tell you the moment a customer writes to you.</Text>
      <View style={styles.card}>
        {POINTS.map(([bold, rest]) => (
          <Text key={bold} style={styles.point}><Text style={styles.bold}>{bold}</Text> {rest}</Text>
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={[styles.primary, busy && { opacity: 0.6 }]} onPress={() => void done(true)}>
          <Text style={styles.primaryText}>Turn on notifications</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={styles.ghost} onPress={() => void done(false)}>
          <Text style={styles.ghostText}>Not now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: space.xl, gap: space.lg },
  icon: { alignSelf: "center", width: 112, height: 112, borderRadius: 56, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", marginTop: 64 },
  title: { fontFamily: font.bold, fontSize: 24, color: colors.text, textAlign: "center" },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: "center" },
  card: { backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  point: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.text },
  bold: { fontFamily: font.semibold },
  actions: { marginTop: "auto", marginBottom: space.xl, gap: space.sm },
  primary: { height: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
  ghost: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  ghostText: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
});
