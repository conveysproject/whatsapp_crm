"use client";
import { JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import type { Deal } from "./DealCard";

interface ContactDealsProps {
  contactId: string;
}

export function ContactDeals({ contactId }: ContactDealsProps): JSX.Element {
  const { getToken } = useAuth();
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  const { data } = useQuery<{ data: Deal[] }>({
    queryKey: ["deals", "contact", contactId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${api}/v1/deals?contactId=${contactId}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      return res.json() as Promise<{ data: Deal[] }>;
    },
  });

  const deals = data?.data ?? [];

  if (deals.length === 0) {
    return (
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Deals</h2>
        <p className="text-sm text-gray-400">No deals linked to this contact.</p>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Deals ({deals.length})</h2>
      <div className="space-y-2">
        {deals.map((deal) => (
          <div key={deal.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2.5 bg-white">
            <div>
              <p className="text-sm font-medium text-gray-900">{deal.title}</p>
              <p className="text-xs text-gray-400 capitalize mt-0.5">{deal.stage}</p>
            </div>
            {deal.value != null && (
              <p className="text-sm font-semibold text-emerald-600">
                {Number(deal.value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
