import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { config } from "../config";
import { createAuthClient, type AuthClient } from "./client";
import { parseAuthMode, resolveAuthMode, type AuthMode } from "./provider";
import { createSessionStore, type SecureKV, type SessionStore } from "./session-store";

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

const MODE_KEY = "wbmsg.auth.mode";
const PROBE_TIMEOUT_MS = 5_000;

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

function withTimeout(p: Promise<number>, ms: number): Promise<number> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(0), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(0); });
  });
}

/** Picks the login from EXPO_PUBLIC_AUTH_PROVIDER (clerk by default) and provides useAuth() for it. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = parseAuthMode(config.authProvider);
  const [mode, setMode] = useState<AuthMode | null>(configured === "auto" ? null : configured);

  useEffect(() => {
    if (configured !== "auto") return;
    let alive = true;
    void resolveAuthMode("auto", {
      probe: () => withTimeout(wbmsgSession().client.probe(), PROBE_TIMEOUT_MS),
      lastKnown: () => SecureStore.getItemAsync(MODE_KEY),
      remember: (m) => SecureStore.setItemAsync(MODE_KEY, m),
    }).then((m) => { if (alive) setMode(m); });
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
