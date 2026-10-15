import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { Api } from "./api";

const TOKEN_KEY = "wbmsg.pushToken";
const ASKED_KEY = "wbmsg.pushAsked";

/** Where a tapped push should take the user. Contract with the API: data = { type, conversationId?, contactId? }. */
export function routeForNotification(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { type?: unknown; conversationId?: unknown; contactId?: unknown };
  if ((d.type === "new_message" || d.type === "conversation_assigned") && typeof d.conversationId === "string") {
    return `/conversation/${d.conversationId}`;
  }
  if (d.type === "closure_overdue" && typeof d.contactId === "string") return `/contact/${d.contactId}`;
  return null;
}

/** Asks the OS only when needed. Null when not a real device, no EAS project id, or permission denied. */
export async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const projectId: string | undefined =
    Constants.expoConfig?.extra?.["eas"]?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId) return null;

  const current = await Notifications.getPermissionsAsync();
  const status = current.status === "granted" ? "granted" : (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Messages", importance: Notifications.AndroidImportance.HIGH });
  }
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function registerDevice(api: Api): Promise<string | null> {
  const token = await getPushToken();
  if (!token) return null;
  await api("/users/device-token", { method: "POST", body: { token, platform: Platform.OS } });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  return token;
}

export async function unregisterDevice(api: Api): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return;
  try {
    await api("/users/device-token", { method: "DELETE", body: { token } });
  } finally {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

/** Shared phones: remove this device from the user's push list first, then end the Clerk session even if offline. */
export async function signOutAndUnregister(api: Api, signOut: () => Promise<unknown>): Promise<void> {
  try {
    await unregisterDevice(api);
  } catch {
    // Offline: the server prunes the token when Expo reports it dead, or when the next user registers this phone.
  }
  await signOut();
}

export async function shouldAskForPushPermission(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ASKED_KEY)) === null;
}

export async function markPushPermissionAsked(): Promise<void> {
  await SecureStore.setItemAsync(ASKED_KEY, "1");
}

export async function refreshBadge(api: Api): Promise<void> {
  try {
    const { data } = await api<{ data: { count: number } }>("/conversations/unread-count");
    await Notifications.setBadgeCountAsync(data.count);
  } catch {
    // Badge is cosmetic; never block the app on it.
  }
}
