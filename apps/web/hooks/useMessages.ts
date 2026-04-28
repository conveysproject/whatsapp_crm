"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

interface Message {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  contentType: string;
  body: string | null;
  sentAt: string;
}

interface MessagesResponse {
  data: Message[];
}

async function fetchMessages(conversationId: string, token: string): Promise<Message[]> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const res = await fetch(`${apiUrl}/v1/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch messages");
  const json = await res.json() as MessagesResponse;
  return json.data;
}

export function useMessages(conversationId: string | null) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const token = await getToken();
      return fetchMessages(conversationId, token ?? "");
    },
    enabled: conversationId !== null,
  });

  useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();
    const handler = (data: { conversationId: string }) => {
      if (data.conversationId === conversationId) {
        void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      }
    };
    socket.on("new-message", handler);
    return () => { socket.off("new-message", handler); };
  }, [conversationId, queryClient]);

  return query;
}
