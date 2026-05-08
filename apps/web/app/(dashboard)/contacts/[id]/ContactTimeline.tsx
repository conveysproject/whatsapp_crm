"use client";
import { JSX, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type Tab = "all" | "messages" | "deals";

interface MessageItem {
  id: string;
  body: string | null;
  direction: string;
  createdAt: string;
}

interface DealItem {
  id: string;
  title: string;
  stage: string;
  createdAt: string;
}

type TimelineItem =
  | { type: "message"; id: string; body: string | null; direction: string; createdAt: string }
  | { type: "deal"; id: string; title: string; stage: string; createdAt: string };

export function ContactTimeline({ contactId }: { contactId: string }): JSX.Element {
  const [tab, setTab] = useState<Tab>("all");

  const { data: messagesData } = useQuery<{ data: MessageItem[] }>({
    queryKey: ["contact-messages", contactId],
    queryFn: () => fetch(`/api/v1/messages/log?contactId=${contactId}&page=1`).then((r) => r.json()),
  });

  const { data: dealsData } = useQuery<{ data: DealItem[] }>({
    queryKey: ["contact-deals", contactId],
    queryFn: () => fetch(`/api/v1/deals?contactId=${contactId}`).then((r) => r.json()),
  });

  const timeline: TimelineItem[] = [
    ...(messagesData?.data ?? []).map((m): TimelineItem => ({
      type: "message",
      id: m.id,
      body: m.body,
      direction: m.direction,
      createdAt: m.createdAt,
    })),
    ...(dealsData?.data ?? []).map((d): TimelineItem => ({
      type: "deal",
      id: d.id,
      title: d.title,
      stage: d.stage,
      createdAt: d.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filtered = timeline.filter((item) => tab === "all" || item.type + "s" === tab);

  const dotColor: Record<string, string> = {
    message: "bg-blue-400",
    deal: "bg-green-400",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card space-y-4">
      <h2 className="font-semibold text-gray-900">Activity Timeline</h2>

      <div className="flex gap-2">
        {(["all", "messages", "deals"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-xs rounded-full capitalize transition-colors ${
              tab === t ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">No activity yet.</p>
      )}

      <div className="space-y-3">
        {filtered.map((item) => (
          <div key={`${item.type}-${item.id}`} className="flex gap-3 text-sm">
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotColor[item.type] ?? "bg-gray-400"}`} />
            <div>
              {item.type === "message" && (
                <p className="text-gray-700">
                  {item.body ? (item.body.length > 100 ? item.body.slice(0, 100) + "..." : item.body) : "(media)"}
                  <span className="ml-1 text-gray-400">({item.direction})</span>
                </p>
              )}
              {item.type === "deal" && (
                <p className="text-gray-700">
                  Deal: <strong>{item.title}</strong> — {item.stage}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(item.createdAt).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
