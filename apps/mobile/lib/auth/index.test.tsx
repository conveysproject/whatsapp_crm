const mockStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete mockStore[k]; }),
}));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AuthProvider, useAuth, wbmsgSession } from "./index";
import { recoverFrom401 } from "./recovery";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
});

describe("AuthProvider", () => {
  it("restores from SecureStore and exposes the same shape with a stable getToken", async () => {
    mockStore["wbmsg.auth.refresh"] = "r1";
    mockStore["wbmsg.auth.user"] = "usr_1";
    const { result, rerender } = await renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current).toMatchObject({ isLoaded: true, isSignedIn: true, userId: "usr_1" }));
    const first = result.current.getToken;
    await rerender({});
    expect(result.current.getToken).toBe(first);

    globalThis.fetch = jest.fn(async () => ({ status: 200, ok: true, json: async () => ({ ok: true }) })) as unknown as typeof fetch;
    await act(async () => { await wbmsgSession().store.signOut(); });
    expect(result.current).toMatchObject({ isLoaded: true, isSignedIn: false, userId: null });
  });
});

describe("AuthProvider: 401 recovery wiring", () => {
  it("a 401 on an unexpired token forces a refresh; a 401 refresh signs out", async () => {
    mockStore["wbmsg.auth.refresh"] = "r1";
    mockStore["wbmsg.auth.user"] = "usr_1";
    await wbmsgSession().store.restore();
    const { result } = await renderHook(useAuth, { wrapper });
    await waitFor(() => expect(result.current.isSignedIn).toBe(true));
    globalThis.fetch = jest.fn(async () => ({ status: 401, ok: false, json: async () => ({ error: { code: "SESSION_EXPIRED" } }) })) as unknown as typeof fetch;
    await act(async () => { await expect(recoverFrom401("stale")).resolves.toBeNull(); });
    expect(result.current).toMatchObject({ isSignedIn: false, userId: null });
  });
});
