import { createSessionStore, KEYS, type RefreshResult, type SecureKV } from "./session-store";

function b64url(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function access(sub: string, n = 0): string {
  return `${b64url("{}")}.${b64url(JSON.stringify({ sub, n }))}.sig`;
}

function memoryKV(initial: Record<string, string> = {}): SecureKV & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get: jest.fn(async (k: string) => data[k] ?? null),
    set: jest.fn(async (k: string, v: string) => { data[k] = v; }),
    del: jest.fn(async (k: string) => { delete data[k]; }),
  };
}

function setup(opts: { kv?: ReturnType<typeof memoryKV>; refresh?: jest.Mock; signOutRemote?: jest.Mock } = {}) {
  let t = 1_000_000;
  const kv = opts.kv ?? memoryKV();
  const refresh = opts.refresh ?? jest.fn<Promise<RefreshResult>, [string]>();
  const signOutRemote = opts.signOutRemote ?? jest.fn(async () => undefined);
  const store = createSessionStore({ kv, refresh, signOutRemote, now: () => t });
  return { store, kv, refresh, signOutRemote, advance: (ms: number) => { t += ms; } };
}

describe("session store: restore", () => {
  it("is loading until restored, then signed out with nothing stored", async () => {
    const { store } = setup();
    expect(store.getState()).toEqual({ status: "loading", userId: null });
    await store.restore();
    expect(store.getState()).toEqual({ status: "signed_out", userId: null });
    await expect(store.getToken()).resolves.toBeNull();
  });

  it("is signed in from SecureStore without any network call", async () => {
    const { store, refresh } = setup({ kv: memoryKV({ [KEYS.refresh]: "r1", [KEYS.userId]: "usr_1" }) });
    await store.restore();
    expect(store.getState()).toEqual({ status: "signed_in", userId: "usr_1" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("drops a half-stored session (refresh token without user id)", async () => {
    const kv = memoryKV({ [KEYS.refresh]: "r1" });
    const { store } = setup({ kv });
    await store.restore();
    expect(store.getState().status).toBe("signed_out");
    expect(kv.data[KEYS.refresh]).toBeUndefined();
  });

  it("treats an unreadable SecureStore as signed out", async () => {
    const kv = memoryKV();
    (kv.get as jest.Mock).mockRejectedValue(new Error("keychain"));
    const { store } = setup({ kv });
    await store.restore();
    expect(store.getState().status).toBe("signed_out");
  });
});

describe("session store: signIn / getToken", () => {
  it("stores refresh token, user id and device id in SecureStore and keeps the access token in memory only", async () => {
    const { store, kv, refresh } = setup();
    await store.restore();
    const listener = jest.fn();
    store.subscribe(listener);
    await store.signIn({ accessToken: access("usr_9"), refreshToken: "r1", expiresIn: 600, deviceId: "dev_1" });
    expect(kv.data).toEqual({ [KEYS.refresh]: "r1", [KEYS.userId]: "usr_9", [KEYS.deviceId]: "dev_1" });
    expect(Object.values(kv.data)).not.toContain(access("usr_9"));
    expect(store.getState()).toEqual({ status: "signed_in", userId: "usr_9" });
    expect(listener).toHaveBeenCalled();
    await expect(store.getToken()).resolves.toBe(access("usr_9"));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the previous device id when a sign-in returns none", async () => {
    const { store, kv } = setup({ kv: memoryKV({ [KEYS.deviceId]: "dev_old" }) });
    await store.restore();
    await store.signIn({ accessToken: access("u"), refreshToken: "r1", expiresIn: 600 });
    expect(kv.data[KEYS.deviceId]).toBe("dev_old");
    await expect(store.deviceId()).resolves.toBe("dev_old");
  });

  it("rejects tokens without a subject", async () => {
    const { store } = setup();
    await store.restore();
    await expect(store.signIn({ accessToken: "bad", refreshToken: "r", expiresIn: 600 })).rejects.toThrow();
    expect(store.getState().status).toBe("signed_out");
  });

  it("refreshes shortly before expiry and persists the rotated refresh token", async () => {
    const refresh = jest.fn(async (): Promise<RefreshResult> => ({ ok: true, accessToken: access("usr_9", 2), refreshToken: "r2", expiresIn: 600 }));
    const { store, kv, advance } = setup({ refresh });
    await store.restore();
    await store.signIn({ accessToken: access("usr_9", 1), refreshToken: "r1", expiresIn: 600 });
    advance(530_000); // 70 s left: still fine
    await expect(store.getToken()).resolves.toBe(access("usr_9", 1));
    advance(20_000); // inside the refresh window
    await expect(store.getToken()).resolves.toBe(access("usr_9", 2));
    expect(refresh).toHaveBeenCalledWith("r1");
    expect(kv.data[KEYS.refresh]).toBe("r2");
  });

  it("runs one refresh for concurrent callers (rotation reuse would revoke the session)", async () => {
    let resolve!: (r: RefreshResult) => void;
    const refresh = jest.fn(() => new Promise<RefreshResult>((r) => { resolve = r; }));
    const { store } = setup({ kv: memoryKV({ [KEYS.refresh]: "r1", [KEYS.userId]: "u" }), refresh });
    await store.restore();
    const calls = [store.getToken(), store.getToken(), store.getToken()];
    resolve({ ok: true, accessToken: access("u"), refreshToken: "r2", expiresIn: 600 });
    await expect(Promise.all(calls)).resolves.toEqual([access("u"), access("u"), access("u")]);
    expect(refresh).toHaveBeenCalledTimes(1);
    // The next expiry uses the rotated token.
    await store.getToken();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("signs out locally when the refresh token is rejected (401)", async () => {
    const refresh = jest.fn(async (): Promise<RefreshResult> => ({ ok: false }));
    const kv = memoryKV({ [KEYS.refresh]: "r1", [KEYS.userId]: "u", [KEYS.deviceId]: "dev" });
    const { store } = setup({ kv, refresh });
    await store.restore();
    await expect(store.getToken()).resolves.toBeNull();
    expect(store.getState()).toEqual({ status: "signed_out", userId: null });
    expect(kv.data).toEqual({ [KEYS.deviceId]: "dev" });
  });

  it("stays signed in on a transient refresh failure and retries next time", async () => {
    const refresh = jest.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true, accessToken: access("u"), refreshToken: "r2", expiresIn: 600 });
    const { store } = setup({ kv: memoryKV({ [KEYS.refresh]: "r1", [KEYS.userId]: "u" }), refresh });
    await store.restore();
    await expect(store.getToken()).rejects.toThrow("network");
    expect(store.getState().status).toBe("signed_in");
    await expect(store.getToken()).resolves.toBe(access("u"));
  });

  it("discards a refresh that finishes after sign-out", async () => {
    let resolve!: (r: RefreshResult) => void;
    const refresh = jest.fn(() => new Promise<RefreshResult>((r) => { resolve = r; }));
    const kv = memoryKV({ [KEYS.refresh]: "r1", [KEYS.userId]: "u" });
    const { store } = setup({ kv, refresh });
    await store.restore();
    const pending = store.getToken();
    const out = store.signOut();
    resolve({ ok: true, accessToken: access("u"), refreshToken: "r2", expiresIn: 600 });
    await out;
    await expect(pending).resolves.toBeNull();
    expect(kv.data[KEYS.refresh]).toBeUndefined();
    expect(store.getState().status).toBe("signed_out");
  });
});

describe("session store: signOut", () => {
  it("revokes the session on the server with the current access token, then clears everything but the device id", async () => {
    const { store, kv, signOutRemote } = setup();
    await store.restore();
    await store.signIn({ accessToken: access("u"), refreshToken: "r1", expiresIn: 600, deviceId: "dev" });
    await store.signOut();
    expect(signOutRemote).toHaveBeenCalledWith(access("u"));
    expect(kv.data).toEqual({ [KEYS.deviceId]: "dev" });
    expect(store.getState()).toEqual({ status: "signed_out", userId: null });
    await expect(store.getToken()).resolves.toBeNull();
  });

  it("still signs out locally when the server call fails", async () => {
    const signOutRemote = jest.fn(async () => { throw new Error("offline"); });
    const { store } = setup({ signOutRemote });
    await store.restore();
    await store.signIn({ accessToken: access("u"), refreshToken: "r1", expiresIn: 600 });
    await expect(store.signOut()).resolves.toBeUndefined();
    expect(store.getState().status).toBe("signed_out");
  });

  it("skips the server call when no access token can be obtained", async () => {
    const refresh = jest.fn(async (): Promise<RefreshResult> => { throw new Error("offline"); });
    const { store, signOutRemote, kv } = setup({ kv: memoryKV({ [KEYS.refresh]: "r1", [KEYS.userId]: "u" }), refresh });
    await store.restore();
    await store.signOut();
    expect(signOutRemote).not.toHaveBeenCalled();
    expect(kv.data[KEYS.refresh]).toBeUndefined();
  });
});
