import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { config } from "../config";
import { createAuthClient, type AuthClient } from "./client";
import { classifyProbe, parseAuthMode, parseModeRecord, recordAfterProbe, startMode, type AuthMode } from "./provider";
import { setSessionRecovery } from "./recovery";
import { createSessionStore, KEYS, type SecureKV, type SessionStore } from "./session-store";

/** The same shape the app used from @clerk/expo's useAuth(), whichever login is active. */
export interface AuthValue {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | null | undefined;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const ModeContext = createContext<AuthMode>("clerk");

/** `auto` mode's memory between launches (kept outside the wbmsg.auth.* session keys, which a downgrade wipes). */
export const MODE_KEY = "wbmsg.mode";

const secureKV: SecureKV = {
  get: (k) => SecureStore.getItemAsync(k),
  set: (k, v) => SecureStore.setItemAsync(k, v),
  del: (k) => SecureStore.deleteItemAsync(k),
};

// Clerk's own session cache, unchanged from before.
const clerkTokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key),
  saveToken: (key: string, value: string) => SecureStore.setItemAsync(key, value),
};

let wbmsg: { client: AuthClient; store: SessionStore; restoring: Promise<void> | null } | null = null;

/** The WBMSG-login session for this process (one store, so refreshes are never run twice). */
export function wbmsgSession(): { client: AuthClient; store: SessionStore } {
  if (!wbmsg) {
    const client = createAuthClient();
    const store = createSessionStore({ kv: secureKV, refresh: (t) => client.refresh(t), signOutRemote: (t) => client.signOut(t) });
    wbmsg = { client, store, restoring: null };
  }
  return wbmsg;
}

async function bestEffort<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/**
 * `auto` mode at launch: decide from what is stored (no network, so the app shows at once), then ask the API in the
 * background. The answer only changes what the NEXT launch uses; the running session never switches login.
 */
async function startAutoMode(onMode: (mode: AuthMode) => void): Promise<void> {
  const [raw, storedRefresh] = await Promise.all([bestEffort(SecureStore.getItemAsync(MODE_KEY)), bestEffort(SecureStore.getItemAsync(KEYS.refresh))]);
  const record = parseModeRecord(raw);
  const start = startMode(record, Boolean(storedRefresh));
  if (start.wipeWbmsg) {
    // A downgrade to Clerk was decided on earlier launches: the WBMSG session cannot be used any more.
    await Promise.all(Object.values(KEYS).map((k) => bestEffort(SecureStore.deleteItemAsync(k))));
  }
  onMode(start.mode);
  const res = await wbmsgSession().client.probe();
  const next = recordAfterProbe(record, start.mode, classifyProbe(res.status, res.body));
  await bestEffort(SecureStore.setItemAsync(MODE_KEY, JSON.stringify(next)));
}

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useClerkAuth();
  const value = useMemo<AuthValue>(
    () => ({ isLoaded, isSignedIn, userId, getToken: getToken as AuthValue["getToken"], signOut: signOut as AuthValue["signOut"] }),
    [isLoaded, isSignedIn, userId, getToken, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function WbmsgBridge({ children }: { children: ReactNode }) {
  const session = wbmsgSession();
  const { store } = session;
  useEffect(() => {
    if (wbmsg && !wbmsg.restoring) wbmsg.restoring = store.restore();
    // API calls that get a 401 on an unexpired token (server-revoked session) force one refresh and retry once.
    setSessionRecovery((stale) => store.forceRefresh(stale));
    return () => setSessionRecovery(null);
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const getToken = useCallback(() => store.getToken(), [store]);
  const signOut = useCallback(() => store.signOut(), [store]);
  const value = useMemo<AuthValue>(
    () => ({ isLoaded: state.status !== "loading", isSignedIn: state.status === "signed_in", userId: state.userId, getToken, signOut }),
    [state, getToken, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Picks the login from EXPO_PUBLIC_AUTH_PROVIDER (clerk by default) and provides useAuth() for it. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = parseAuthMode(config.authProvider);
  // `auto` waits only for the local SecureStore read (no network) before rendering.
  const [mode, setMode] = useState<AuthMode | null>(configured === "auto" ? null : configured);

  useEffect(() => {
    if (configured !== "auto") return;
    let alive = true;
    void startAutoMode((m) => { if (alive) setMode((current) => current ?? m); }).catch(() => {
      if (alive) setMode((current) => current ?? "clerk");
    });
    return () => { alive = false; };
  }, [configured]);

  if (!mode) return null;
  if (mode === "clerk") {
    return (
      <ModeContext.Provider value="clerk">
        <ClerkProvider publishableKey={config.clerkPublishableKey} tokenCache={clerkTokenCache}>
          <ClerkBridge>{children}</ClerkBridge>
        </ClerkProvider>
      </ModeContext.Provider>
    );
  }
  return (
    <ModeContext.Provider value="wbmsg">
      <WbmsgBridge>{children}</WbmsgBridge>
    </ModeContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export function useAuthMode(): AuthMode {
  return useContext(ModeContext);
}
