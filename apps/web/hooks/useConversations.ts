"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

export interface LastMessage {
  id: string;
  body: string | null;
  direction: string;
  contentType: string | null;
}

export interface Conversation {
  id: string;
  organizationId: string;
  whatsappContactId: string | null;
  status: string;
  assignedTo: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  serviceWindowActive?: boolean;
  lastMessage: LastMessage | null;
  contact?: { id: string; firstName: string | null; lastName: string | null; phoneNumber: string; tags: string[] } | null;
  label?: { id: string; name: string; color: string } | null;
}

interface ConversationsResponse {
  data: Conversation[];
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function fetchConversations(token: string, status?: string, labelId?: string): Promise<Conversation[]> {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (labelId) params.set("labelId", labelId);
  const res = await fetch(`${API_URL}/v1/conversations?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  const json = await res.json() as ConversationsResponse;
  return json.data;
}

export function useConversations(status?: string, labelId?: string) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["conversations", status ?? "all", labelId ?? "none"],
    queryFn: async () => {
      const token = await getToken();
      return fetchConversations(token ?? "", status, labelId);
    },
  });

  useEffect(() => {
    const socket = getSocket();
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };
    socket.on("new-message", handler);
    socket.on("conversation:status", handler);
    socket.on("conversation:assign", handler);
    socket.on("conversation:assigned", handler);
    return () => {
      socket.off("new-message", handler);
      socket.off("conversation:status", handler);
      socket.off("conversation:assign", handler);
      socket.off("conversation:assigned", handler);
    };
  }, [queryClient]);

  return query;
}

export function useSearchConversations(q: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["conversations-search", q],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/conversations/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Search failed");
      const json = await res.json() as ConversationsResponse;
      return json.data;
    },
    enabled: q.trim().length >= 2,
    staleTime: 10_000,
  });
}
