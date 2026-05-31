"use client";

import { JSX, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { CreateOfferModal } from "@/components/deals/CreateOfferModal";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Deal {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  createdAt: string;
}

const STAGE_COLORS: Record<string, string> = {
  lead:        "bg-blue-100 text-blue-700",
  qualified:   "bg-purple-100 text-purple-700",
  proposal:    "bg-yellow-100 text-yellow-700",
  negotiation: "bg-orange-100 text-orange-700",
  won:         "bg-green-100 text-green-700",
  lost:        "bg-red-100 text-red-700",
};

interface Props {
  contactId: string;
  contactName: string;
}

export function ContactDealsTab({ contactId, contactName }: Props): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [showOffer, setShowOffer] = useState(false);

  const { data = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["contact-deals-tab", contactId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/deals?contactId=${contactId}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      return res.ok ? (await res.json() as { data: Deal[] }).data : [];
    },
  });

  function handleCreated() {
    void qc.invalidateQueries({ queryKey: ["contact-deals-tab", contactId] });
    void qc.invalidateQueries({ queryKey: ["deals"] });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700">
          Deals{data.length > 0 ? ` (${data.length})` : ""}
        </span>
        <button
          onClick={() => setShowOffer(true)}
          className="text-xs font-medium text-green-700 border border-green-200 bg-green-50 px-2.5 py-1 rounded-lg hover:bg-green-100 transition-colors"
        >
          + Create Offer
        </button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && data.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">No deals yet.</p>
      )}

      {!isLoading && data.length > 0 && (
        <div className="space-y-3">
          {data.map((deal) => (
            <div
              key={deal.id}
              className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(deal.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </p>
              </div>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                  STAGE_COLORS[deal.stage.toLowerCase()] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {deal.stage}
              </span>
              {deal.value != null && (
                <span className="text-sm font-semibold text-gray-700 shrink-0">
                  {Number(deal.value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {showOffer && (
        <CreateOfferModal
          contactId={contactId}
          contactName={contactName}
          onClose={() => setShowOffer(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
