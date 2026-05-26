"use client";

import { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Deal {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  createdAt: string;
}

const STAGE_COLORS: Record<string, string> = {
  new:       "bg-blue-100 text-blue-700",
  qualified: "bg-purple-100 text-purple-700",
  proposal:  "bg-yellow-100 text-yellow-700",
  won:       "bg-green-100 text-green-700",
  lost:      "bg-red-100 text-red-700",
};

export function ContactDealsTab({ contactId }: { contactId: string }): JSX.Element {
  const { getToken } = useAuth();

  const { data = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["contact-deals", contactId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/deals?contactId=${contactId}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      return res.ok ? (await res.json() as { data: Deal[] }).data : [];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-10">No deals yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((deal) => (
        <div
          key={deal.id}
          className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(deal.createdAt).toLocaleDateString("en-IN")}
            </p>
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
              STAGE_COLORS[deal.stage] ?? "bg-gray-100 text-gray-700"
            }`}
          >
            {deal.stage}
          </span>
          {deal.value != null && (
            <span className="text-sm font-semibold text-gray-700 shrink-0">
              ₹{deal.value.toLocaleString("en-IN")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
