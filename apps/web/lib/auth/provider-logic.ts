import type { TokenStatus } from "./token-store";

export interface ProviderState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
}

export interface ProviderDecision {
  state: ProviderState;
  redirect: boolean;
  retry: boolean;
}

const PUBLIC_AUTH_PATHS = [
  /^\/sign-in(\/|$)/,
  /^\/sign-up(\/|$)/,
  /^\/forgot-password(\/|$)/,
  /^\/reset-password(\/|$)/,
  /^\/admin\/sign-in(\/|$)/,
  /^\/invitations\//,
  /^\/client-invitations\//,
];

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((re) => re.test(pathname));
}

/** Backoff while the token endpoint is unavailable: 1s, 2s, 4s ... max 30s. */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** attempt);
}

/** Decide provider state after a token attempt. Redirect only on a definite sign-out after being signed in. */
export function decide(input: {
  token: string | null;
  status: TokenStatus;
  userId: string | null;
  wasSignedIn: boolean;
  wasLoaded: boolean;
}): ProviderDecision {
  const { token, status, userId, wasSignedIn, wasLoaded } = input;
  if (token !== null) {
    return { state: { isLoaded: true, isSignedIn: true, userId }, redirect: false, retry: false };
  }
  if (status === "signed_out") {
    return { state: { isLoaded: true, isSignedIn: false, userId: null }, redirect: wasSignedIn, retry: false };
  }
  // unknown (transient outage): before first load stay not-loaded and retry; afterwards keep state.
  return {
    state: wasLoaded
      ? { isLoaded: true, isSignedIn: wasSignedIn, userId: wasSignedIn ? userId : null }
      : { isLoaded: false, isSignedIn: false, userId: null },
    redirect: false,
    retry: !wasLoaded,
  };
}
