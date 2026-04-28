import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";

const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface MobileMessage {
  id: string;
  body: string | null;
  direction: "inbound" | "outbound";
  contentType: string;
  sentAt: string;
}

export function useMessages(conversationId: string) {
  const { getToken } = useAuth();
  return useQuery<MobileMessage[]>({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json() as { data: MobileMessage[] };
      return data.data ?? [];
    },
    staleTime: 10_000,
  });
}
