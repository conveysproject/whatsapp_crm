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
import { AuthProvider, useAuth, useAuthMode, wbmsgSession } from "./index";

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
