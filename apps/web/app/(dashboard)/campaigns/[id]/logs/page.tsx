"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

type LogTab = "queue" | "executed" | "expired";

interface Recipient {
  id: string;
  status: string;
  contact: { firstName: string | null; lastName: string | null; phoneNumber: string };
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  sent: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
  read: "bg-purple-100 text-purple-700",
  failed: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-600",
};

export default function CampaignLogsPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<LogTab>("queue");

  const queueQuery = useQuery<{ data: Recipient[] }>({
    queryKey: ["campaign-queue-log", id],
    queryFn: () => fetch(`/api/v1/campaigns/${id}/queue-log`).then((r) => r.json()),
    enabled: tab === "queue",
  });

  const executedQuery = useQuery<{ data: Recipient[] }>({
    queryKey: ["campaign-recipients", id],
    queryFn: () => fetch(`/api/v1/campaigns/${id}/recipients`).then((r) => r.json()),
    enabled: tab === "executed",
  });

  const expiredQuery = useQuery<{ data: Recipient[] }>({
    queryKey: ["campaign-expired-log", id],
    queryFn: () => fetch(`/api/v1/campaigns/${id}/expired-log`).then((r) => r.json()),
    enabled: tab === "expired",
  });

  const activeData =
    tab === "queue" ? queueQuery.data?.data :
    tab === "executed" ? executedQuery.data?.data :
    expiredQuery.data?.data;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campaign Logs</h1>
        <a
          href={`/api/v1/campaigns/${id}/report`}
          className="px-4 py-2 border text-sm rounded hover:bg-gray-50"
          download
        >
          Download Report
        </a>
      </div>

      <div className="flex border-b">
        {(["queue", "executed", "expired"] as LogTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${
              tab === t ? "border-green-600 text-green-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="border rounded-lg divide-y">
        {(activeData ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">No records in this tab.</p>
        )}
        {(activeData ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between p-3">
            <div>
              <p className="text-sm font-medium">
                {[r.contact.firstName, r.contact.lastName].filter(Boolean).join(" ") || "Unknown"}
              </p>
              <p className="text-xs text-gray-500">{r.contact.phoneNumber}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[r.status] ?? "bg-gray-100 text-gray-600"}`}>
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
