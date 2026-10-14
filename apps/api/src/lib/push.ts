import Expo, { type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import type { PrismaClient } from "@prisma/client";

export interface PushPayload {
  title: string;
  body: string;
  /** Read by the mobile app: { type, conversationId?, contactId? } */
  data: Record<string, string>;
}

const PREVIEW_MAX = 100;
const expo = new Expo();

/** Sends to every registered device of the user. Returns accepted tickets. Never throws. */
export async function sendPushToUser(
  prisma: PrismaClient,
  userId: string,
  payload: PushPayload & { badge?: number },
): Promise<number> {
  try {
    const [devices, user] = await Promise.all([
      prisma.userDevice.findMany({ where: { userId }, select: { deviceToken: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } }),
    ]);
    const tokens = new Set<string>();
    for (const d of devices) if (d.deviceToken && Expo.isExpoPushToken(d.deviceToken)) tokens.add(d.deviceToken);
    if (user?.pushToken && Expo.isExpoPushToken(user.pushToken)) tokens.add(user.pushToken);
    if (tokens.size === 0) return 0;

    const messages: ExpoPushMessage[] = [...tokens].map((to) => ({
      to,
      title: payload.title,
      body: payload.body.slice(0, PREVIEW_MAX),
      data: payload.data,
      sound: "default",
      ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
    }));

    let accepted = 0;
    const dead: string[] = [];
    for (const chunk of expo.chunkPushNotifications(messages)) {
      let tickets: ExpoPushTicket[];
      try {
        tickets = await expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        console.error(`[push] send failed user=${userId}: ${(err as Error).message}`);
        continue;
      }
      tickets.forEach((t, i) => {
        if (t.status === "ok") accepted++;
        else if (t.details?.error === "DeviceNotRegistered") dead.push(chunk[i]!.to as string);
      });
    }

    if (dead.length > 0) {
      await prisma.userDevice.deleteMany({ where: { userId, deviceToken: { in: dead } } });
      if (user?.pushToken && dead.includes(user.pushToken)) {
        await prisma.user.update({ where: { id: userId }, data: { pushToken: null } });
      }
    }
    return accepted;
  } catch (err) {
    console.error(`[push] failed user=${userId}: ${(err as Error).message}`);
    return 0;
  }
}

/** App icon badge: chats assigned to the user that are open/pending and have unread messages. */
export async function unreadChatCount(prisma: PrismaClient, organizationId: string, userId: string): Promise<number> {
  return prisma.conversation.count({
    where: { organizationId, assignedTo: userId, status: { in: ["open", "pending"] }, unreadCount: { gt: 0 } },
  });
}

/** Badge + send. Never throws. */
export async function pushToUser(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  let badge: number | undefined;
  try {
    badge = await unreadChatCount(prisma, organizationId, userId);
  } catch {
    badge = undefined;
  }
  await sendPushToUser(prisma, userId, { ...payload, ...(badge !== undefined ? { badge } : {}) });
}
