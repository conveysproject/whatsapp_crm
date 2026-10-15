import { useQuery } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { useApi } from "./api-context";

export async function setBadgeFromCount(count: number | undefined): Promise<void> {
  if (count === undefined) return;
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Badge is cosmetic.
  }
}

/** Unread chats assigned to me; realtime invalidates ["unread-count"] on new messages, assignments and status changes. */
export function useUnreadBadge(): number | undefined {
  const api = useApi();
  const { data } = useQuery({
    queryKey: ["unread-count"],
    queryFn: async () => (await api<{ data: { count: number } }>("/conversations/unread-count")).data.count,
  });
  useEffect(() => { void setBadgeFromCount(data); }, [data]);
  return data;
}
