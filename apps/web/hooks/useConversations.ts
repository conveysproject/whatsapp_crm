"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

interface Conversation {
  id: string;
  organizationId: string;
  whatsappContactId: string | null;
  status: string;
  lastMessageAt: string | null;
}

interface ConversationsResponse {
  data: Conversation[];
}

async function fetchConversations(token: string): Promise<Conversation[]> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const res = await fetch(`${apiUrl}/v1/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  const json = await res.json() as ConversationsResponse;
  return json.data;
}

export function useConversations() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const token = await getToken();
      return fetchConversations(token ?? "");
    },
  });

  useEffect(() => {
    const socket = getSocket();
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };
    socket.on("new-message", handler);
    return () => { socket.off("new-message", handler); };
  }, [queryClient]);

  return query;
}
