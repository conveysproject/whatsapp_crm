import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useApi } from "../../lib/api-context";
import { MeProvider } from "../../lib/me-context";
import { resolveGate } from "../../lib/session-gate";
import { colors, font, radius, space } from "../../lib/theme";

function Message({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable accessibilityRole="button" style={styles.button} onPress={onAction}>
        <Text style={styles.buttonText}>{action}</Text>
      </Pressable>
    </View>
  );
}

export default function AppLayout() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const api = useApi();
  const gate = useQuery({ queryKey: ["gate"], queryFn: () => resolveGate(api), enabled: isLoaded && isSignedIn === true, staleTime: Infinity });

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!gate.data) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  switch (gate.data.kind) {
    case "super_admin":
      return <Message title="Use the web dashboard" body="Super admin accounts use the web dashboard." action="Sign out" onAction={() => void signOut()} />;
    case "no_account":
      return <Message title="No WBMSG account" body="This login isn't part of a WBMSG workspace yet. Ask your admin to invite you, then sign in again." action="Sign out" onAction={() => void signOut()} />;
    case "error":
      return <Message title="Can't reach WBMSG" body={gate.data.message} action="Try again" onAction={() => void gate.refetch()} />;
    case "ok":
      return (
        <MeProvider me={gate.data.me}>
          <Stack screenOptions={{ headerShown: false }} />
        </MeProvider>
      );
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md, backgroundColor: colors.surface },
  title: { fontFamily: font.bold, fontSize: 22, color: colors.text, textAlign: "center" },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: "center" },
  button: { minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: space.sm },
  buttonText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
});
