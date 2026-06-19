"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface LeadStatusOption {
  id: string;
  name: string;
  color: string;
}

export function useLeadStatuses(): { data: LeadStatusOption[]; isLoading: boolean } {
  const { getToken } = useAuth();
  const { data = [], isLoading } = useQuery<LeadStatusOption[]>({
    queryKey: ["lead-statuses"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/lead-statuses`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      if (!res.ok) return [];
      return (await res.json() as { data: LeadStatusOption[] }).data;
    },
  });
  return { data, isLoading };
}
