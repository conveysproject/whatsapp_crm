"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { authProvider } from "./config";
import { createTokenStore } from "./token-store";

export interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
  signOut: (opts?: { redirectUrl?: string }) => Promise<void>;
}

const PUBLIC_AUTH_PATHS = [
  /^\/sign-in(\/|$)/,
  /^\/sign-up(\/|$)/,
  /^\/forgot-password(\/|$)/,
  /^\/reset-password(\/|$)/,
  /^\/admin\/sign-in(\/|$)/,
  /^\/invitations\//,
];

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((re) => re.test(pathname));
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const queryClient = useQueryClient();
  const userIdRef = useRef<string | null>(null);
  const store = useMemo(
    () =>
      createTokenStore(async () => {
        const res = await fetch("/api/auth/token", { credentials: "same-origin", cache: "no-store" });
        if (res.status === 401) return { accessToken: null, expiresAt: null };
        if (!res.ok) throw new Error("token unavailable");
        const body = (await res.json()) as { accessToken?: string | null; expiresAt?: number; userId?: string };
        if (typeof body.userId === "string") userIdRef.current = body.userId;
        return { accessToken: body.accessToken ?? null, expiresAt: body.expiresAt ?? null };
      }),
    [],
  );
  const [state, setState] = useState<{ isLoaded: boolean; isSignedIn: boolean; userId: string | null }>({
    isLoaded: false,
    isSignedIn: false,
    userId: null,
  });
  const signedInRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void store.getToken().then((t) => {
      if (cancelled) return;
      signedInRef.current = t !== null;
      setState({ isLoaded: true, isSignedIn: t !== null, userId: t !== null ? userIdRef.current : null });
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const getToken = useCallback(async () => {
    const t = await store.getToken();
    if (t === null && signedInRef.current) {
      signedInRef.current = false;
      userIdRef.current = null;
      setState({ isLoaded: true, isSignedIn: false, userId: null });
      const { pathname, search } = window.location;
      if (!isPublicAuthPath(pathname)) {
        window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(pathname + search)}`);
      }
    }
    return t;
  }, [store]);

  const signOut = useCallback(
    async (opts?: { redirectUrl?: string }) => {
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
