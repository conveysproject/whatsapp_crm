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
jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: "proj-1" } } } } }));

import { __resetHandledResponsesForTests, takeUnhandledResponseRoute, getPushToken, refreshBadge, registerDevice, routeForNotification, shouldAskForPushPermission, markPushPermissionAsked, signOutAndUnregister, unregisterDevice } from "./push";

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  jest.clearAllMocks();
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
  });
});

describe("permission prompt bookkeeping and badge", () => {
  it("asks once", async () => {
    expect(await shouldAskForPushPermission()).toBe(true);
    await markPushPermissionAsked();
    expect(await shouldAskForPushPermission()).toBe(false);
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
