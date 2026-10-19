"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { decide, isPublicAuthPath, retryDelayMs } from "./provider-logic";
import type { ProviderState } from "./provider-logic";
import { shouldRecheckSession } from "./session-expired";
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

  // Open tabs notice a revoked session within 60 s (and when the tab regains focus).
  useEffect(() => {
    let running = false;
    const check = async (): Promise<void> => {
      if (running || signingOut.current) return;
      if (!shouldRecheckSession(stateRef.current.isSignedIn, window.location.pathname)) return;
      running = true;
      try {
        const res = await fetch("/api/auth/session-check", { credentials: "same-origin", cache: "no-store" });
        if (res.status !== 401) return; // 200 fine; 503/other = unknown, never sign out
        store.clear();
        queryClient.clear();
        const next: ProviderState = { isLoaded: true, isSignedIn: false, userId: null };
        stateRef.current = next;
        setState(next);
        const { pathname, search } = window.location;
        if (!isPublicAuthPath(pathname)) {
          window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(pathname + search)}`);
        }
      } catch {
        // network error: unknown, keep the session
      } finally {
        running = false;
      }
    };
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void check();
    };
    const timer = setInterval(() => void check(), 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [store, queryClient]);

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

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
