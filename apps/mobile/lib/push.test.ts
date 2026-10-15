import type { Api } from "./api";

const mockStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete mockStore[k]; }),
}));
const mockNotif = {
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setBadgeCountAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
};
// Imports run before `const mockNotif` is initialised, so delegate lazily at call time.
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: (...a: unknown[]) => mockNotif.getPermissionsAsync(...a),
  requestPermissionsAsync: (...a: unknown[]) => mockNotif.requestPermissionsAsync(...a),
  getExpoPushTokenAsync: (...a: unknown[]) => mockNotif.getExpoPushTokenAsync(...a),
  setNotificationChannelAsync: (...a: unknown[]) => mockNotif.setNotificationChannelAsync(...a),
  setBadgeCountAsync: (...a: unknown[]) => mockNotif.setBadgeCountAsync(...a),
  AndroidImportance: { HIGH: 4 },
}));
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: "proj-1" } } } } }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { __resetHandledResponsesForTests, takeUnhandledResponseRoute, getPushToken, refreshBadge, registerDevice, routeForNotification, shouldAskForPushPermission, markPushPermissionAsked, signOutAndUnregister, unregisterDevice, flushPendingUnregister } from "./push";

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  jest.clearAllMocks();
  void AsyncStorage.clear();
  __resetHandledResponsesForTests();
});

describe("routeForNotification", () => {
  it("opens the chat for message and assignment pushes", () => {
    expect(routeForNotification({ type: "new_message", conversationId: "c-1" })).toBe("/conversation/c-1");
    expect(routeForNotification({ type: "conversation_assigned", conversationId: "c-2" })).toBe("/conversation/c-2");
  });
  it("opens the contact for overdue lead closures", () => {
    expect(routeForNotification({ type: "closure_overdue", contactId: "ct-1" })).toBe("/contact/ct-1");
  });
  it("ignores anything else", () => {
    expect(routeForNotification({ type: "new_message" })).toBeNull();
    expect(routeForNotification({ type: "other", conversationId: "c-1" })).toBeNull();
    expect(routeForNotification(null)).toBeNull();
  });
});

describe("getPushToken / registerDevice", () => {
  it("returns null and sends nothing when permission is denied", async () => {
    mockNotif.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    mockNotif.requestPermissionsAsync.mockResolvedValue({ status: "denied" });
    const api = jest.fn() as unknown as Api;
    expect(await registerDevice(api)).toBeNull();
    expect(api).not.toHaveBeenCalled();
    expect(mockNotif.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("registers the Expo token with the project id and remembers it", async () => {
    mockNotif.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockNotif.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[a]" });
    const api = jest.fn().mockResolvedValue({ data: { registered: true } }) as unknown as Api;
    expect(await registerDevice(api)).toBe("ExponentPushToken[a]");
    expect(mockNotif.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj-1" });
    expect(api).toHaveBeenCalledWith("/users/device-token", { method: "POST", body: { token: "ExponentPushToken[a]", platform: expect.any(String) } });
    expect(mockStore["wbmsg.pushToken"]).toBe("ExponentPushToken[a]");
  });

  it("on Android creates the channel before asking for permission", async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    try {
      const order: string[] = [];
      mockNotif.setNotificationChannelAsync.mockImplementation(async () => { order.push("channel"); });
      mockNotif.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
      mockNotif.requestPermissionsAsync.mockImplementation(async () => { order.push("request"); return { status: "granted" }; });
      mockNotif.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[c]" });
      await getPushToken();
      expect(order).toEqual(["channel", "request"]);
    } finally {
      Object.defineProperty(Platform, "OS", { value: original, configurable: true });
    }
  });

  it("getPushToken never asks the OS twice when already granted", async () => {
    mockNotif.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockNotif.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[b]" });
    await getPushToken();
    expect(mockNotif.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe("unregister and sign-out", () => {
  it("DELETEs the remembered token with a JSON body and forgets it", async () => {
    mockStore["wbmsg.pushToken"] = "ExponentPushToken[a]";
    const api = jest.fn().mockResolvedValue(undefined) as unknown as Api;
    await unregisterDevice(api);
    expect(api).toHaveBeenCalledWith("/users/device-token", { method: "DELETE", body: { token: "ExponentPushToken[a]" } });
    expect(mockStore["wbmsg.pushToken"]).toBeUndefined();
  });

  it("does nothing when no token was registered", async () => {
    const api = jest.fn() as unknown as Api;
    await unregisterDevice(api);
    expect(api).not.toHaveBeenCalled();
  });

  it("unregisters before signing out, and still signs out if the network call fails", async () => {
    mockStore["wbmsg.pushToken"] = "ExponentPushToken[a]";
    const order: string[] = [];
    const api = jest.fn(async () => { order.push("delete"); throw new Error("offline"); }) as unknown as Api;
    const signOut = jest.fn(async () => { order.push("signOut"); });
    await signOutAndUnregister(api, signOut);
    expect(order).toEqual(["delete", "signOut"]);
    expect(mockStore["wbmsg.pushToken"]).toBeUndefined();
    expect(mockStore["wbmsg.pushTokenPending"]).toBe("ExponentPushToken[a]");
  });

  it("resets the OS badge after sign-out, and a badge failure does not break sign-out", async () => {
    const api = jest.fn().mockResolvedValue({}) as unknown as Api;
    const signOut = jest.fn(async () => undefined);
    mockNotif.setBadgeCountAsync.mockResolvedValue(undefined);
    await signOutAndUnregister(api, signOut);
    expect(mockNotif.setBadgeCountAsync).toHaveBeenCalledWith(0);
    mockNotif.setBadgeCountAsync.mockRejectedValueOnce(new Error("no badge"));
    await expect(signOutAndUnregister(api, signOut)).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it("keeps the token as pending when the DELETE fails", async () => {
    mockStore["wbmsg.pushToken"] = "ExponentPushToken[a]";
    const api = jest.fn().mockRejectedValue(new Error("offline")) as unknown as Api;
    await expect(unregisterDevice(api)).rejects.toThrow("offline");
    expect(mockStore["wbmsg.pushToken"]).toBeUndefined();
    expect(mockStore["wbmsg.pushTokenPending"]).toBe("ExponentPushToken[a]");
  });
});

describe("flushPendingUnregister", () => {
  it("POSTs then DELETEs the pending token, then clears it", async () => {
    mockStore["wbmsg.pushTokenPending"] = "ExponentPushToken[a]";
    const api = jest.fn().mockResolvedValue(undefined) as unknown as Api;
    await flushPendingUnregister(api);
    expect((api as unknown as jest.Mock).mock.calls).toEqual([
      ["/users/device-token", { method: "POST", body: { token: "ExponentPushToken[a]", platform: Platform.OS } }],
      ["/users/device-token", { method: "DELETE", body: { token: "ExponentPushToken[a]" } }],
    ]);
    expect(mockStore["wbmsg.pushTokenPending"]).toBeUndefined();
  });

  it("keeps the pending token on failure and never throws", async () => {
    mockStore["wbmsg.pushTokenPending"] = "ExponentPushToken[a]";
    const api = jest.fn().mockRejectedValue(new Error("offline")) as unknown as Api;
    await expect(flushPendingUnregister(api)).resolves.toBeUndefined();
    expect(mockStore["wbmsg.pushTokenPending"]).toBe("ExponentPushToken[a]");
  });

  it("does nothing when nothing is pending", async () => {
    const api = jest.fn() as unknown as Api;
    await flushPendingUnregister(api);
    expect(api).not.toHaveBeenCalled();
  });
});

describe("permission prompt bookkeeping and badge", () => {
  it("asks once per user, stored outside SecureStore", async () => {
    expect(await shouldAskForPushPermission("u1")).toBe(true);
    await markPushPermissionAsked("u1");
    expect(await shouldAskForPushPermission("u1")).toBe(false);
    expect(await shouldAskForPushPermission("u2")).toBe(true);
    expect(await AsyncStorage.getItem("wbmsg.pushAsked.u1")).toBe("1");
    expect(Object.keys(mockStore)).toEqual([]);
  });

  it("sets the app badge from the unread-count endpoint and ignores failures", async () => {
    const api = jest.fn().mockResolvedValueOnce({ data: { count: 3 } }).mockRejectedValueOnce(new Error("offline")) as unknown as Api;
    await refreshBadge(api);
    expect(api).toHaveBeenCalledWith("/conversations/unread-count");
    expect(mockNotif.setBadgeCountAsync).toHaveBeenCalledWith(3);
    await expect(refreshBadge(api)).resolves.toBeUndefined();
  });
});

describe("takeUnhandledResponseRoute", () => {
  const resp = (identifier: string, data: unknown) => ({ notification: { request: { identifier, content: { data } } } });
  it("routes a given notification only once", () => {
    const r = resp("n1", { type: "new_message", conversationId: "c-1" });
    expect(takeUnhandledResponseRoute(r)).toBe("/conversation/c-1");
    expect(takeUnhandledResponseRoute(r)).toBeNull();
  });
  it("routes different notifications each once", () => {
    expect(takeUnhandledResponseRoute(resp("a", { type: "new_message", conversationId: "c-1" }))).toBe("/conversation/c-1");
    expect(takeUnhandledResponseRoute(resp("b", { type: "closure_overdue", contactId: "ct-1" }))).toBe("/contact/ct-1");
  });
  it("returns null for null or garbage", () => {
    expect(takeUnhandledResponseRoute(null)).toBeNull();
    expect(takeUnhandledResponseRoute(undefined)).toBeNull();
    expect(takeUnhandledResponseRoute({} as never)).toBeNull();
  });
});
