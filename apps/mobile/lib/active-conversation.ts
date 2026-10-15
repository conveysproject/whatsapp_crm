let active: string | null = null;

/** Set by the Chat screen while it is focused, cleared when it loses focus. */
export function setActiveConversation(id: string | null): void {
  active = id;
}

export function getActiveConversation(): string | null {
  return active;
}

/** Foreground push presentation: no banner or sound for the chat the agent is already reading. */
export function notificationPresentation(
  data: unknown,
  activeConversationId: string | null,
): { shouldShowBanner: boolean; shouldShowList: boolean; shouldPlaySound: boolean; shouldSetBadge: boolean } {
  const conversationId =
    data && typeof data === "object" && typeof (data as { conversationId?: unknown }).conversationId === "string"
      ? (data as { conversationId: string }).conversationId
      : null;
  const isOpenChat = conversationId !== null && conversationId === activeConversationId;
  return { shouldShowBanner: !isOpenChat, shouldShowList: !isOpenChat, shouldPlaySound: !isOpenChat, shouldSetBadge: true };
}
