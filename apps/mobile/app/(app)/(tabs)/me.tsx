import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../../components/Screen";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { useApi } from "../../../lib/api-context";
import { config } from "../../../lib/config";
import { useMe } from "../../../lib/me-context";
import { markPushPermissionAsked, registerDevice, signOutAndUnregister } from "../../../lib/push";
import type { Gate } from "../../../lib/session-gate";
import { colors, font, space } from "../../../lib/theme";

export default function MeScreen() {
  const me = useMe();
  const api = useApi();
  const { signOut, userId } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const org = useQuery({ queryKey: ["organization"], queryFn: async () => (await api<{ data: { name: string } }>("/organizations/me")).data, staleTime: 10 * 60_000 });
  const [availability, setAvailability] = useState<"online" | "away">(me.availability === "away" ? "away" : "online");
  const confirmedAvailability = useRef<"online" | "away">(me.availability === "away" ? "away" : "online");
  const [availError, setAvailError] = useState<string | null>(null);
  const saveAvailability = useMutation({
    mutationFn: (a: "online" | "away") => api("/users/me/availability", { method: "PATCH", body: { availability: a } }),
    onMutate: (a) => { setAvailError(null); setAvailability(a); },
    onSuccess: (_d, a) => {
      confirmedAvailability.current = a;
      qc.setQueryData<Gate>(["gate", userId], (g) => (g && g.kind === "ok" ? { ...g, me: { ...g.me, availability: a } } : g));
    },
    onError: () => { setAvailability(confirmedAvailability.current); setAvailError("Couldn't update your status. Try again."); },
  });
  const [pushStatus, setPushStatus] = useState<string>("undetermined");
  useEffect(() => {
    const read = () => void Notifications.getPermissionsAsync().then((p) => setPushStatus(p.status));
    read();
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") read(); });
    return () => sub.remove();
  }, []);
  async function onPushRow() {
    if (pushStatus === "granted") return;
    if (pushStatus === "denied") return void Linking.openSettings();
    await registerDevice(api).catch(() => null);
    if (userId) await markPushPermissionAsked(userId).catch(() => null);
    const p = await Notifications.getPermissionsAsync();
    if (mounted.current) setPushStatus(p.status);
  }

  const pushValue = pushStatus === "granted" ? "On" : pushStatus === "denied" ? "Off · Open settings" : "Turn on";

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
    <Screen title="Me" scroll>
      <Text style={styles.name}>{me.fullName}</Text>
      <Text style={styles.sub}>{me.email}{org.data ? ` · ${org.data.name}` : ""}</Text>

      <Text style={styles.sec}>AVAILABILITY</Text>
      <View style={{ paddingHorizontal: space.xl }}>
        <SegmentedControl accessibilityLabel="Availability" value={availability} onChange={(a) => saveAvailability.mutate(a)} options={[{ value: "online", label: "Online" }, { value: "away", label: "Away" }]} />
        <Text style={styles.hint}>{availability === "online" ? "Teammates see you as Online." : "Teammates see you as Away."}</Text>
        {availError ? <Text style={styles.availError} accessibilityRole="alert">{availError}</Text> : null}
      </View>

      <Text style={styles.sec}>APP</Text>
      <View style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Notifications on this phone, ${pushValue}`} onPress={() => void onPushRow()} style={styles.row}>
          <Text style={styles.rowText}>Notifications on this phone</Text>
          <Text style={styles.rowValue}>{pushValue}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/canned-responses")} style={styles.row}>
          <Text style={styles.rowText}>Canned responses</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(config.webUrl)} style={styles.row}>
          <Text style={styles.rowText}>Open web dashboard</Text><Text style={styles.rowValue}>↗</Text>
        </Pressable>
      </View>

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
  sec: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, letterSpacing: 0.5, paddingHorizontal: space.xl, marginTop: space.xl, marginBottom: space.sm },
  hint: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: space.sm },
  availError: { fontFamily: font.medium, fontSize: 13, color: colors.danger, marginTop: 4 },
  card: { marginHorizontal: space.xl, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  rowText: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.text },
  rowValue: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
  signOut: { minHeight: 48, marginHorizontal: space.xl, marginTop: space.xl, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  signOutBusy: { opacity: 0.6 },
  signOutText: { fontFamily: font.semibold, fontSize: 15, color: colors.danger },
  error: { fontFamily: font.regular, fontSize: 14, color: colors.danger, textAlign: "center", marginTop: space.sm, paddingHorizontal: space.xl },
});
