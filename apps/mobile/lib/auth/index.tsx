import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { createAuthClient, type AuthClient } from "./client";
import { setSessionRecovery } from "./recovery";
import { createSessionStore, type SecureKV, type SessionStore } from "./session-store";

/** What useAuth() gives to the app. */
export interface AuthValue {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | null | undefined;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const secureKV: SecureKV = {
  get: (k) => SecureStore.getItemAsync(k),
  set: (k, v) => SecureStore.setItemAsync(k, v),
  del: (k) => SecureStore.deleteItemAsync(k),
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

export function AuthProvider({ children }: { children: ReactNode }) {
  return <WbmsgBridge>{children}</WbmsgBridge>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
