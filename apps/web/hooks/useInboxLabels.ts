"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

export interface InboxLabel {
  id: string;
  name: string;
  color: string;
  count: number;
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function useInboxLabels() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["inbox-labels"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/inbox-labels`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch inbox labels");
      const json = await res.json() as { data: InboxLabel[] };
      return json.data;
    },
    staleTime: 30_000,
  });
}
