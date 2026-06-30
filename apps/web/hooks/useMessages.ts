"use client";

import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

export interface Message {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  contentType?: string | null;
  body: string | null;
  richContent?: Record<string, unknown> | null;
  sentAt: string;
  mediaUrl?: string | null;
  status?: string | null;
  whatsappMessageId?: string | null;
}

interface MessagesPage {
  data: Message[];
  pagination: { hasMore: boolean; nextCursor: string | null };
}

async function fetchMessages(conversationId: string, token: string, cursor?: string): Promise<MessagesPage> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`${apiUrl}/v1/conversations/${conversationId}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json() as Promise<MessagesPage>;
}

export function useMessages(conversationId: string | null) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery<MessagesPage, Error, InfiniteData<MessagesPage>, ["messages", string | null], string | undefined>({
    queryKey: ["messages", conversationId],
    queryFn: async ({ pageParam }) => {
      if (!conversationId) return { data: [], pagination: { hasMore: false, nextCursor: null } };
      const token = await getToken();
      return fetchMessages(conversationId, token ?? "", pageParam);
    },
    getNextPageParam: (lastPage) => lastPage.pagination.hasMore ? (lastPage.pagination.nextCursor ?? undefined) : undefined,
    initialPageParam: undefined,
    enabled: conversationId !== null,
  });

  // All messages oldest→newest: older pages come from fetchNextPage (higher index), newest is page 0
  const messages = query.data
    ? [...query.data.pages].toReversed().flatMap((p) => p.data)
    : [];

  useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();

    const newMsgHandler = (data: { conversationId: string }) => {
      if (data.conversationId === conversationId) {
        void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      }
    };

    const statusHandler = (data: { whatsappMessageId: string; status: string }) => {
      queryClient.setQueryData(
        ["messages", conversationId],
        (prev: InfiniteData<MessagesPage> | undefined) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              data: page.data.map((m) =>
                m.whatsappMessageId === data.whatsappMessageId ? { ...m, status: data.status } : m
              ),
            })),
          };
        }
      );
    };

    socket.on("new-message", newMsgHandler);
    socket.on("message:status", statusHandler);
    return () => {
      socket.off("new-message", newMsgHandler);
      socket.off("message:status", statusHandler);
    };
  }, [conversationId, queryClient]);

  return { ...query, messages };
}
