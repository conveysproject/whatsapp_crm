import { decodeJwtClaims } from "./jwt";

/** Key/value storage for secrets. Production uses expo-secure-store; never AsyncStorage. */
export interface SecureKV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  deviceId?: string;
}

/** `ok: false` means the API rejected the refresh token (401): the session is over. Transient failures throw. */
export type RefreshResult = { ok: true; accessToken: string; refreshToken: string; expiresIn?: number } | { ok: false };

export type SessionStatus = "loading" | "signed_in" | "signed_out";
export interface SessionState {
  status: SessionStatus;
  userId: string | null;
}

export const KEYS = {
  refresh: "wbmsg.auth.refresh",
  userId: "wbmsg.auth.user",
  deviceId: "wbmsg.auth.device",
} as const;

const DEFAULT_TTL_S = 600;
// Refresh this long before the access token expires, so a request never carries an about-to-expire token.
const REFRESH_SKEW_MS = 60_000;

export interface SessionStore {
  restore(): Promise<void>;
  getState(): SessionState;
  subscribe(listener: () => void): () => void;
  getToken(): Promise<string | null>;
  signIn(tokens: SessionTokens): Promise<void>;
  signOut(): Promise<void>;
  deviceId(): Promise<string | null>;
}

export function createSessionStore(deps: {
  kv: SecureKV;
  refresh: (refreshToken: string) => Promise<RefreshResult>;
  signOutRemote: (accessToken: string) => Promise<void>;
  now?: () => number;
}): SessionStore {
  const now = deps.now ?? Date.now;
  let state: SessionState = { status: "loading", userId: null };
  let refreshToken: string | null = null;
  let access: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<string | null> | null = null;
  let inflightRaw: Promise<RefreshResult> | null = null;
  // Bumped on every sign-in/sign-out so a refresh that started earlier cannot write over the new state.
  let generation = 0;
  const listeners = new Set<() => void>();

  function setState(next: SessionState) {
    state = next;
    for (const l of [...listeners]) l();
  }

  async function bestEffort(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch {
      // SecureStore hiccup: in-memory state is still correct for this run.
    }
  }

  async function clearLocal() {
    refreshToken = null;
    access = null;
    setState({ status: "signed_out", userId: null });
    await bestEffort(() => deps.kv.del(KEYS.refresh));
    await bestEffort(() => deps.kv.del(KEYS.userId));
  }

  function expiryOf(expiresIn: number | undefined) {
    return now() + (expiresIn ?? DEFAULT_TTL_S) * 1000;
  }

  async function runRefresh(): Promise<string | null> {
    const gen = generation;
    const token = refreshToken;
    if (!token) return null;
    const raw = deps.refresh(token);
    inflightRaw = raw;
    const result = await raw;
    if (gen !== generation) return null;
    if (!result.ok) {
      generation += 1;
      await clearLocal();
      return null;
    }
    refreshToken = result.refreshToken;
    access = { token: result.accessToken, expiresAt: expiryOf(result.expiresIn) };
    await bestEffort(() => deps.kv.set(KEYS.refresh, result.refreshToken));
    return result.accessToken;
  }

  return {
    async restore() {
      try {
        const [storedRefresh, storedUser] = await Promise.all([deps.kv.get(KEYS.refresh), deps.kv.get(KEYS.userId)]);
        if (storedRefresh && storedUser) {
          refreshToken = storedRefresh;
          setState({ status: "signed_in", userId: storedUser });
          return;
        }
        if (storedRefresh || storedUser) {
          await clearLocal();
          return;
        }
      } catch {
        // fall through: an unreadable keychain means we cannot use the session
      }
      refreshToken = null;
      setState({ status: "signed_out", userId: null });
    },

    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async getToken() {
      if (state.status !== "signed_in") return null;
      if (access && access.expiresAt - REFRESH_SKEW_MS > now()) return access.token;
      inflight ??= runRefresh().finally(() => {
        inflight = null;
        inflightRaw = null;
      });
      return inflight;
    },

    async signIn(tokens) {
      const sub = decodeJwtClaims(tokens.accessToken)?.["sub"];
      if (typeof sub !== "string" || !sub) throw new Error("Sign-in returned an unusable token");
      generation += 1;
      refreshToken = tokens.refreshToken;
      access = { token: tokens.accessToken, expiresAt: expiryOf(tokens.expiresIn) };
      await deps.kv.set(KEYS.refresh, tokens.refreshToken);
      await deps.kv.set(KEYS.userId, sub);
      if (tokens.deviceId) await bestEffort(() => deps.kv.set(KEYS.deviceId, tokens.deviceId as string));
      setState({ status: "signed_in", userId: sub });
    },

    async signOut() {
      const cached = access && access.expiresAt > now() ? access.token : null;
      const pendingRaw = inflightRaw;
      const storedRefresh = refreshToken;
      generation += 1;
      await clearLocal();

      // Revoke the server session when we can get a valid access token; local sign-out never waits on the network's outcome.
      let token = cached;
      try {
        if (!token && pendingRaw) {
          const r = await pendingRaw;
          token = r.ok ? r.accessToken : null;
        } else if (!token && storedRefresh) {
          const r = await deps.refresh(storedRefresh);
          token = r.ok ? r.accessToken : null;
        }
        if (token) await deps.signOutRemote(token);
      } catch {
        // offline: the refresh token is gone from this device; the server session expires on its own
      }
    },

    async deviceId() {
      try {
        return await deps.kv.get(KEYS.deviceId);
      } catch {
        return null;
      }
    },
  };
}
