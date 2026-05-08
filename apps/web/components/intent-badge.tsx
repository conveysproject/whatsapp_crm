"use client";

import { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

interface Props {
  messageId: string;
  text: string;
  direction: "inbound" | "outbound";
}

interface IntentResponse {
  intent: string;
  confidence: number;
}

const INTENT_CONFIG: Record<string, { bg: string; label: string }> = {
  purchase_inquiry: { bg: "bg-green-100 text-green-700", label: "Purchase Intent" },
  support_request:  { bg: "bg-blue-100 text-blue-700",   label: "Support" },
  complaint:        { bg: "bg-red-100 text-red-700",      label: "Complaint" },
  refund_request:   { bg: "bg-orange-100 text-orange-700", label: "Refund" },
  pricing:          { bg: "bg-yellow-100 text-yellow-700", label: "Pricing" },
  general_inquiry:  { bg: "bg-gray-100 text-gray-600",    label: "General" },
};

export function IntentBadge({ messageId, text, direction }: Props): JSX.Element | null {
  const { getToken } = useAuth();

  const { data } = useQuery<IntentResponse>({
    queryKey: ["intent", messageId],
    queryFn: async () => {
      const token = await getToken();
      const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const res = await fetch(`${apiUrl}/v1/ai/intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({ messageId, text }),
      });
      if (!res.ok) throw new Error("Failed to fetch intent");
      const json = await res.json() as { data: IntentResponse };
      return json.data;
    },
    enabled: direction === "inbound" && text.trim().length > 5,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  if (!data || data.confidence < 0.7) return null;

  const config = INTENT_CONFIG[data.intent];
  if (!config) return null;

  return (
    <span
      className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg}`}
    >
      {config.label}
    </span>
  );
}
