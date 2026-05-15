"use client";

import { JSX, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getSocket } from "@/lib/socket";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Campaign {
  id: string;
  name: string;
  status: string;
  isArchived: boolean;
  scheduledAt: string | null;
  sentAt: string | null;
  campaignType: string;
  messageInterval: number | null;
}

interface Stats {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
}

interface Progress {
  sent: number;
  failed: number;
  total: number;
  percentage: number;
}

const statusVariant: Record<string, "gray" | "yellow" | "blue" | "green" | "red"> = {
  draft: "gray", scheduled: "yellow", running: "blue", paused: "yellow",
  completed: "green", cancelled: "red", aborted: "red",
};

export default function CampaignDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [acting, setActing] = useState(false);

  const { data: report } = useQuery<{ campaign: Campaign; stats: Stats }>({
    queryKey: ["campaign-report", id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/campaigns/${id}/report`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed");
      return (await res.json() as { data: { campaign: Campaign; stats: Stats } }).data;
    },
    refetchInterval: (query) => query.state.data?.campaign.status === "running" ? 10000 : false,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    function onProgress(data: Progress & { campaignId: string }) {
      if (data.campaignId === id) setProgress(data);
    }
    function onCompleted(data: { campaignId: string }) {
      if (data.campaignId === id) {
        void queryClient.invalidateQueries({ queryKey: ["campaign-report", id] });
        void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      }
    }

    socket.on("campaign:progress", onProgress);
    socket.on("campaign:completed", onCompleted);
    socket.on("campaign:aborted", onCompleted);
    return () => {
      socket.off("campaign:progress", onProgress);
      socket.off("campaign:completed", onCompleted);
      socket.off("campaign:aborted", onCompleted);
    };
  }, [id, queryClient]);

  async function doAction(action: string) {
    setActing(true);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/campaigns/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      await queryClient.invalidateQueries({ queryKey: ["campaign-report", id] });
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    } finally {
      setActing(false);
    }
  }

  if (!report) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const { campaign, stats } = report;
  const liveProgress = progress ?? {
    sent: stats.sent,
    failed: stats.failed,
    total: stats.sent + stats.delivered + stats.read + stats.failed + stats.pending,
    percentage: 0,
  };
  const livePercentage = liveProgress.total > 0
    ? Math.round(((liveProgress.sent + liveProgress.failed) / liveProgress.total) * 100)
    : (campaign.status === "completed" ? 100 : 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{campaign.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Type: <span className="capitalize">{campaign.campaignType}</span>
            {campaign.messageInterval ? ` · ${campaign.messageInterval}s between messages` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={statusVariant[campaign.status] ?? "gray"}>{campaign.status}</Badge>
          {campaign.status === "running" && (
            <Button variant="destructive" size="sm" onClick={() => { void doAction("abort"); }} disabled={acting}>
              Abort
            </Button>
          )}
          {campaign.status === "paused" && (
            <Button size="sm" onClick={() => { void doAction("resume"); }} disabled={acting}>
              Resume
            </Button>
          )}
          {campaign.status === "running" && (
            <Button variant="secondary" size="sm" onClick={() => { void doAction("pause"); }} disabled={acting}>
              Pause
            </Button>
          )}
          {!campaign.isArchived && (campaign.status === "completed" || campaign.status === "aborted") && (
            <Button variant="secondary" size="sm" onClick={() => { void doAction("archive"); }} disabled={acting}>
              Archive
            </Button>
          )}
          {campaign.isArchived && (
            <Button variant="secondary" size="sm" onClick={() => { void doAction("unarchive"); }} disabled={acting}>
              Unarchive
            </Button>
          )}
        </div>
      </div>

      {/* Live progress bar */}
      {(campaign.status === "running" || campaign.status === "completed" || campaign.status === "aborted") && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Progress</span>
            <span className="font-medium text-gray-900">{livePercentage}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${campaign.status === "aborted" ? "bg-red-500" : "bg-brand-600"}`}
              style={{ width: `${livePercentage}%` }}
            />
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            <span className="text-green-600 font-medium">{liveProgress.sent} sent</span>
            <span className="text-red-500">{liveProgress.failed} failed</span>
            <span>{liveProgress.total} total</span>
          </div>
        </div>
      )}

      {/* Recipient stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {([
          { label: "Sent", value: stats.sent, color: "text-gray-900" },
          { label: "Delivered", value: stats.delivered, color: "text-blue-600" },
          { label: "Read", value: stats.read, color: "text-green-600" },
          { label: "Failed", value: stats.failed, color: "text-red-600" },
          { label: "Pending", value: stats.pending, color: "text-yellow-600" },
        ] as const).map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Requeue failed */}
      {stats.failed > 0 && campaign.status !== "running" && (
        <Button variant="secondary" size="sm" onClick={() => { void doAction("requeue-failed"); }} disabled={acting}>
          Requeue {stats.failed} failed recipients
        </Button>
      )}

      {/* Timestamps */}
      <div className="text-xs text-gray-400 space-y-1">
        {campaign.scheduledAt && <p>Scheduled: {new Date(campaign.scheduledAt).toLocaleString("en-IN")}</p>}
        {campaign.sentAt && <p>Sent: {new Date(campaign.sentAt).toLocaleString("en-IN")}</p>}
      </div>
    </div>
  );
}
