"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

export interface Conversation {
  id: string;
  organizationId: string;
  whatsappContactId: string | null;
  status: string;
  assignedTo: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  contact?: { firstName: string | null; lastName: string | null; phoneNumber: string } | null;
}

interface ConversationsResponse {
  data: Conversation[];
}

async function fetchConversations(token: string, status?: string): Promise<Conversation[]> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  const res = await fetch(`${apiUrl}/v1/conversations?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  const json = await res.json() as ConversationsResponse;
  return json.data;
}

export function useConversations(status?: string) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["conversations", status ?? "all"],
    queryFn: async () => {
      const token = await getToken();
      return fetchConversations(token ?? "", status);
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
    return () => {
      socket.off("new-message", handler);
      socket.off("conversation:status", handler);
      socket.off("conversation:assign", handler);
    };
  }, [queryClient]);

  return query;
}
