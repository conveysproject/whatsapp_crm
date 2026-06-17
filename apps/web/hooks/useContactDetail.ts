"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

export interface ContactDetail {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  email: string | null;
  tags: string[];
  notes: string | null;
  createdAt: string;
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function useContactDetail(contactId: string | null) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["contact-detail", contactId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/${contactId}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch contact");
      const json = await res.json() as { data: ContactDetail };
      return json.data;
    },
    enabled: contactId != null,
    staleTime: 30_000,
  });
}
