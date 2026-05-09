"use client";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";

interface Stats {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export default function TemplateAnalyticsPage({ params }: { params: Promise<{ id: string }> }): JSX.Element {
  const { id } = use(params);
  const { data, isLoading } = useQuery<{ data: Stats }>({
    queryKey: ["template-analytics", id],
    queryFn: () => fetch(`/api/v1/templates/${id}/analytics`).then((r) => r.json()),
  });

  const stats = data?.data ?? { sent: 0, delivered: 0, read: 0, failed: 0 };
  const total = stats.sent + stats.delivered + stats.read + stats.failed;

  const bars = [
    { label: "Sent", value: stats.sent, color: "bg-blue-400" },
    { label: "Delivered", value: stats.delivered, color: "bg-green-400" },
    { label: "Read", value: stats.read, color: "bg-purple-400" },
    { label: "Failed", value: stats.failed, color: "bg-red-400" },
  ];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Template Analytics</h1>
      {isLoading && <p className="text-sm text-gray-400">Loading...</p>}
      {!isLoading && (
        <div className="border rounded-lg p-6 space-y-6">
          <div className="flex gap-4">
            {bars.map((b) => (
              <div key={b.label} className="flex-1 text-center">
                <p className="text-3xl font-bold">{b.value}</p>
                <p className="text-sm text-gray-500">{b.label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {bars.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-16">{b.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3">
                  <div
                    className={`${b.color} h-3 rounded-full transition-all`}
                    style={{ width: total > 0 ? `${(b.value / total) * 100}%` : "0%" }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">
                  {total > 0 ? Math.round((b.value / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
