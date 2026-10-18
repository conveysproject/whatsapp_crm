const mockStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete mockStore[k]; }),
}));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));
const mockClerkGetToken = jest.fn(async () => "clerk-token");
const mockClerkSignOut = jest.fn(async () => undefined);
jest.mock("@clerk/expo", () => ({
  ClerkProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "user_clerk", getToken: mockClerkGetToken, signOut: mockClerkSignOut }),
}));
const mockConfig = { apiUrl: "https://api.test", webUrl: "https://web.test", clerkPublishableKey: "pk", authProvider: "clerk" };
jest.mock("../config", () => ({ get config() { return mockConfig; } }));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AuthProvider, MODE_KEY, useAuth, useAuthMode, wbmsgSession } from "./index";
import { recoverFrom401 } from "./recovery";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const useBoth = () => ({ auth: useAuth(), mode: useAuthMode() });

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
});

describe("AuthProvider", () => {
  it("clerk (default): passes Clerk's useAuth through unchanged", async () => {
    mockConfig.authProvider = "clerk";
    const { result } = await renderHook(useBoth, { wrapper });
    expect(result.current.mode).toBe("clerk");
    expect(result.current.auth).toMatchObject({ isLoaded: true, isSignedIn: true, userId: "user_clerk" });
    expect(result.current.auth.getToken).toBe(mockClerkGetToken);
    await expect(result.current.auth.getToken()).resolves.toBe("clerk-token");
  });

  it("wbmsg: restores from SecureStore and exposes the same shape with a stable getToken", async () => {
    mockConfig.authProvider = "wbmsg";
    mockStore["wbmsg.auth.refresh"] = "r1";
    mockStore["wbmsg.auth.user"] = "usr_1";
    const { result, rerender } = await renderHook(useBoth, { wrapper });
    expect(result.current.mode).toBe("wbmsg");
    await waitFor(() => expect(result.current.auth).toMatchObject({ isLoaded: true, isSignedIn: true, userId: "usr_1" }));
    const first = result.current.auth.getToken;
    await rerender({});
    expect(result.current.auth.getToken).toBe(first);

    globalThis.fetch = jest.fn(async () => ({ status: 200, ok: true, json: async () => ({ ok: true }) })) as unknown as typeof fetch;
    await act(async () => { await wbmsgSession().store.signOut(); });
    expect(result.current.auth).toMatchObject({ isLoaded: true, isSignedIn: false, userId: null });
  });
});

describe("AuthProvider: 401 recovery wiring", () => {
  it("wbmsg: a 401 on an unexpired token forces a refresh; a 401 refresh signs out", async () => {
    mockConfig.authProvider = "wbmsg";
    mockStore["wbmsg.auth.refresh"] = "r1";
    mockStore["wbmsg.auth.user"] = "usr_1";
    await wbmsgSession().store.restore();
    const { result } = await renderHook(useBoth, { wrapper });
    await waitFor(() => expect(result.current.auth.isSignedIn).toBe(true));
    globalThis.fetch = jest.fn(async () => ({ status: 401, ok: false, json: async () => ({ error: { code: "SESSION_EXPIRED" } }) })) as unknown as typeof fetch;
    await act(async () => { await expect(recoverFrom401("stale")).resolves.toBeNull(); });
    expect(result.current.auth).toMatchObject({ isSignedIn: false, userId: null });
  });
});

describe("AuthProvider: auto mode", () => {
  function deferredFetch() {
    let resolve!: (r: { status: number; body: unknown }) => void;
    const pending = new Promise<{ status: number; body: unknown }>((r) => { resolve = r; });
    globalThis.fetch = jest.fn(async () => {
      const r = await pending;
      return { status: r.status, ok: r.status < 300, json: async () => r.body };
    }) as unknown as typeof fetch;
    return (status: number, body: unknown) => resolve({ status, body });
  }

  it("renders at once with the default (clerk) while the probe is still running; the answer applies next launch", async () => {
    mockConfig.authProvider = "auto";
    const answer = deferredFetch();
    const { result } = await renderHook(useBoth, { wrapper });
    await waitFor(() => expect(result.current.mode).toBe("clerk"));
    await act(async () => { answer(200, { keys: [{ kty: "OKP" }] }); });
    await waitFor(() => expect(JSON.parse(mockStore[MODE_KEY] ?? "null")).toEqual({ mode: "wbmsg", clerkSeen: 0 }));
    expect(result.current.mode).toBe("clerk");
  });

  it("uses the remembered wbmsg mode and does not downgrade on one Clerk answer", async () => {
    mockConfig.authProvider = "auto";
    mockStore[MODE_KEY] = JSON.stringify({ mode: "wbmsg", clerkSeen: 0 });
    mockStore["wbmsg.auth.refresh"] = "r1";
    mockStore["wbmsg.auth.user"] = "usr_1";
    const answer = deferredFetch();
    const { result } = await renderHook(useBoth, { wrapper });
    await waitFor(() => expect(result.current.mode).toBe("wbmsg"));
    await act(async () => { answer(404, { error: { code: "NOT_FOUND", message: "Not found" } }); });
    await waitFor(() => expect(JSON.parse(mockStore[MODE_KEY] ?? "null")).toEqual({ mode: "wbmsg", clerkSeen: 1 }));
    expect(result.current.mode).toBe("wbmsg");
    expect(mockStore["wbmsg.auth.refresh"]).toBe("r1");
  });

  it("a decided downgrade takes effect at launch and wipes the WBMSG keys", async () => {
    mockConfig.authProvider = "auto";
    mockStore[MODE_KEY] = JSON.stringify({ mode: "clerk", clerkSeen: 0 });
    mockStore["wbmsg.auth.refresh"] = "r1";
    mockStore["wbmsg.auth.user"] = "usr_1";
    mockStore["wbmsg.auth.device"] = "dev";
    const answer = deferredFetch();
    const { result } = await renderHook(useBoth, { wrapper });
    await waitFor(() => expect(result.current.mode).toBe("clerk"));
    expect(Object.keys(mockStore).filter((k) => k.startsWith("wbmsg.auth."))).toEqual([]);
    await act(async () => { answer(0, null); });
  });
});
