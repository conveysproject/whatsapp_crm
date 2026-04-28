import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";

const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface MobileConversation {
  id: string;
  contactName: string;
  lastMessageBody: string;
  lastMessageAt: string;
  status: "open" | "resolved";
  unreadCount: number;
}

export function useConversations() {
  const { getToken } = useAuth();
  return useQuery<MobileConversation[]>({
    queryKey: ["conversations"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/conversations?status=open&limit=50`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      const data = await res.json() as { data: MobileConversation[] };
      return data.data ?? [];
    },
    staleTime: 30_000,
  });
}
