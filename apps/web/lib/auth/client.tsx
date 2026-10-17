"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { authProvider } from "./config";
import { decide, isPublicAuthPath, retryDelayMs } from "./provider-logic";
import type { ProviderState } from "./provider-logic";
import { createTokenStore } from "./token-store";

export interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
  signOut: (opts?: { redirectUrl?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const queryClient = useQueryClient();
  const store = useMemo(
    () =>
      createTokenStore(async () => {
        const res = await fetch("/api/auth/token", { credentials: "same-origin", cache: "no-store" });
        if (res.status === 401) return { accessToken: null, expiresAt: null };
        if (!res.ok) throw new Error("token unavailable");
        const body = (await res.json()) as { accessToken?: string | null; expiresAt?: number; userId?: string };
        return { accessToken: body.accessToken ?? null, expiresAt: body.expiresAt ?? null, userId: body.userId };
      }),
    [],
  );
  const [state, setState] = useState<ProviderState>({ isLoaded: false, isSignedIn: false, userId: null });
  const stateRef = useRef(state);
  stateRef.current = state;
  const signingOut = useRef(false);

  const refresh = useCallback(async (): Promise<{ token: string | null; retry: boolean }> => {
    const token = await store.getToken();
    const prev = stateRef.current;
    const d = decide({
      token,
      status: store.status(),
      userId: store.userId(),
      wasSignedIn: prev.isSignedIn,
      wasLoaded: prev.isLoaded,
    });
    stateRef.current = d.state;
    setState(d.state);
    if (d.redirect && !signingOut.current) {
      const { pathname, search } = window.location;
      if (!isPublicAuthPath(pathname)) {
        window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(pathname + search)}`);
      }
    }
    return { token, retry: d.retry };
  }, [store]);

  // First load; while the token endpoint is unavailable, keep isLoaded=false and retry with backoff.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const run = async (): Promise<void> => {
      const r = await refresh();
      if (cancelled || !r.retry) return;
      timer = setTimeout(() => void run(), retryDelayMs(attempt++));
    };
    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  const getToken = useCallback(async () => {
    const before = stateRef.current;
    const token = await store.getToken();
    // Only a state change needs a re-render: recovery, or a definite sign-out.
    if (token !== null ? !before.isSignedIn : store.status() === "signed_out" && before.isSignedIn) {
      return (await refresh()).token;
    }
    return token;
  }, [store, refresh]);

  const signOut = useCallback(
    async (opts?: { redirectUrl?: string }) => {
      signingOut.current = true;
      stateRef.current = { ...stateRef.current, isSignedIn: false };
      try {
        await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin" });
      } catch {
        // Cookies may still be set; the reload below re-checks the session.
      }
      store.clear();
      queryClient.clear();
      window.location.assign(opts?.redirectUrl ?? "/sign-in");
    },
    [store, queryClient],
  );

  const value = useMemo<AuthState>(() => ({ ...state, getToken, signOut }), [state, getToken, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useWbmsgAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// Chosen once at module load from the build-time flag, so hook order is stable.
// In Clerk mode this is Clerk's own hook, unchanged (extra fields such as orgRole still work).
export const useAuth = authProvider() === "clerk" ? useClerkAuth : useWbmsgAuth;
