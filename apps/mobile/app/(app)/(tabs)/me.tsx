import { useAuth } from "@clerk/expo";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Screen } from "../../../components/Screen";
import { useApi } from "../../../lib/api-context";
import { useMe } from "../../../lib/me-context";
import { signOutAndUnregister } from "../../../lib/push";
import { colors, font, space } from "../../../lib/theme";

export default function MeScreen() {
  const me = useMe();
  const api = useApi();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function onSignOut() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await signOutAndUnregister(api, signOut);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <Screen title="Me">
      <Text style={styles.name}>{me.fullName}</Text>
      <Text style={styles.sub}>{me.email}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        style={[styles.signOut, busy && styles.signOutBusy]}
        onPress={() => void onSignOut()}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
      {failed ? <Text style={styles.error} accessibilityRole="alert">Couldn't sign out. Try again.</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: font.semibold, fontSize: 17, color: colors.text, paddingHorizontal: space.xl },
  sub: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, paddingHorizontal: space.xl, marginTop: space.xs },
  signOut: { minHeight: 48, marginHorizontal: space.xl, marginTop: space.xl, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  signOutBusy: { opacity: 0.6 },
  signOutText: { fontFamily: font.semibold, fontSize: 15, color: colors.danger },
  error: { fontFamily: font.regular, fontSize: 14, color: colors.danger, textAlign: "center", marginTop: space.sm, paddingHorizontal: space.xl },
});
