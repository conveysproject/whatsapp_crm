import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Redirect, Stack, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useApi } from "../../lib/api-context";
import { config } from "../../lib/config";
import { MeProvider } from "../../lib/me-context";
import { refreshBadge, flushPendingUnregister, registerDevice, shouldAskForPushPermission, takeUnhandledResponseRoute } from "../../lib/push";
import { connectRealtime, isForegroundRefreshable, queryKeysFor } from "../../lib/realtime";
import { resolveGate } from "../../lib/session-gate";
import { colors, font, radius, space } from "../../lib/theme";

function Message({ title, body, action, onAction, failure }: { title: string; body: string; action: string; onAction: () => Promise<void>; failure?: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function run() {
    setBusy(true);
    setFailed(false);
    try {
      await onAction();
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      // Always re-enable, including when onAction resolves without throwing (e.g. refetch returning an error state).
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <View style={styles.center}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} style={[styles.button, busy && styles.buttonBusy]} onPress={() => void run()}>
        <Text style={styles.buttonText}>{action}</Text>
      </Pressable>
      {failed && failure ? <Text style={styles.error} accessibilityRole="alert">{failure}</Text> : null}
    </View>
  );
}

function RealtimeBridge() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    const rt = connectRealtime({
      url: config.apiUrl,
      getToken: () => getToken(),
      onEvent: (event, payload) => {
        for (const queryKey of queryKeysFor(event, payload)) void queryClient.invalidateQueries({ queryKey });
      },
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        rt.ensureConnected();
        void queryClient.invalidateQueries({ predicate: (q) => isForegroundRefreshable(q.queryKey) });
      }
    });
    return () => { sub.remove(); rt.disconnect(); };
  }, [getToken, queryClient]);
  return null;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

// The OS keeps returning the launch notification for the whole process; only the first PushBridge mount may act on it.
let coldStartChecked = false;

function PushBridge() {
  const api0 = useApi();
  const apiRef = useRef(api0);
  apiRef.current = api0;
  const { userId } = useAuth();
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    let cancelled = false;
    const api = apiRef.current;
    void (async () => {
      await flushPendingUnregister(api);
      const { status } = await Notifications.getPermissionsAsync();
      const uid = userIdRef.current;
      if (status === "granted") await registerDevice(api).catch(() => null);
      else if (status === "undetermined" && uid && (await shouldAskForPushPermission(uid)) && !cancelled) routerRef.current.push("/push-permission");
      await refreshBadge(api);
      if (cancelled || coldStartChecked) return;
      coldStartChecked = true;
      const route = takeUnhandledResponseRoute(await Notifications.getLastNotificationResponseAsync());
      Notifications.clearLastNotificationResponse();
      if (route && !cancelled) routerRef.current.push(route as never);
    })();

    const tap = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = takeUnhandledResponseRoute(response);
      if (route) routerRef.current.push(route as never);
    });
    const fg = AppState.addEventListener("change", (state) => { if (state === "active") void refreshBadge(apiRef.current); });
    return () => { cancelled = true; tap.remove(); fg.remove(); };
  }, []);

  return null;
}

export default function AppLayout() {
  const { isLoaded, isSignedIn, userId, signOut } = useAuth();
  const api = useApi();
  const gate = useQuery({
    queryKey: ["gate", userId],
    queryFn: () => resolveGate(api),
    enabled: isLoaded && isSignedIn === true && Boolean(userId),
    staleTime: Infinity,
  });

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!gate.data) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  switch (gate.data.kind) {
    case "super_admin":
      return <Message title="Use the web dashboard" body="Super admin accounts use the web dashboard." action="Sign out" onAction={() => signOut()} failure="Couldn't sign out. Check your connection and try again." />;
    case "no_account":
      return <Message title="No WBMSG account" body="This login isn't part of a WBMSG workspace yet. Ask your admin to invite you, then sign in again." action="Sign out" onAction={() => signOut()} failure="Couldn't sign out. Check your connection and try again." />;
    case "error":
      return <Message title="Can't reach WBMSG" body={gate.data.message} action="Try again" onAction={async () => { await gate.refetch(); }} />;
    case "ok":
      return (
        <MeProvider me={gate.data.me}>
          <RealtimeBridge />
          <PushBridge />
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
  buttonBusy: { opacity: 0.6 },
  buttonText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
  error: { fontFamily: font.regular, fontSize: 14, color: colors.danger, textAlign: "center" },
});
