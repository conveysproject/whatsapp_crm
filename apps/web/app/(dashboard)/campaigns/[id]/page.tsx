"use client";

import { JSX, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getSocket } from "@/lib/socket";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Campaign {
  id: string;
  name: string;
  status: string;
  displayStatus: string;
  isArchived: boolean;
  scheduledAt: string | null;
  sentAt: string | null;
  campaignType: string;
  messageInterval: number | null;
  templateId: string | null;
}

interface Stats {
  sent: number;
  accepted: number;
  delivered: number;
  played: number;
  read: number;
  failed: number;
  pending: number;
  expired: number;
}

interface Progress {
  sent: number;
  failed: number;
  total: number;
  percentage: number;
}

const statusVariant: Record<string, "gray" | "yellow" | "blue" | "green" | "red"> = {
  draft: "gray", upcoming: "yellow", scheduled: "yellow", running: "blue", paused: "yellow",
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

  const { data: templateData } = useQuery<{ name: string } | null>({
    queryKey: ["template-info", report?.campaign.templateId],
    queryFn: async () => {
      if (!report?.campaign.templateId || report.campaign.campaignType !== "template") return null;
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/templates/${report.campaign.templateId}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return null;
      return (await res.json() as { data: { name: string } }).data;
    },
    enabled: !!report && report.campaign.campaignType === "template" && !!report.campaign.templateId,
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
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
        <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const { campaign, stats } = report;

  // Cumulative funnel — each tier includes all higher tiers (a "read" message was also sent + delivered)
  const funnelSent = stats.sent + stats.accepted + stats.delivered + stats.played + stats.read + stats.failed;
  const funnelDelivered = stats.delivered + stats.played + stats.read;
  const funnelRead = stats.read + stats.played;
  const funnelTotal = funnelSent + stats.pending + stats.expired;

  const liveProgress = progress ?? {
    sent: funnelSent,   // everyone who exited pending (includes delivered/read)
    failed: stats.failed,
    total: funnelTotal,
    percentage: 0,
  };
  const livePercentage = liveProgress.total > 0
    ? Math.round(((liveProgress.sent + liveProgress.failed) / liveProgress.total) * 100)
    : (campaign.status === "completed" ? 100 : 0);

  const deliveryRate = funnelSent > 0 ? Math.round((funnelDelivered / funnelSent) * 100) : 0;
  const readRate = funnelDelivered > 0 ? Math.round((funnelRead / funnelDelivered) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50/60">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* Breadcrumb */}
        <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Campaigns
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{campaign.name}</h1>
            <div className="flex items-center gap-3 mt-1.5">
              <Badge variant={statusVariant[campaign.displayStatus ?? campaign.status] ?? "gray"}>
                {campaign.displayStatus ?? campaign.status}
              </Badge>
              {templateData && (
                <span className="text-sm text-gray-500">Template: <span className="text-gray-800 font-medium">{templateData.name}</span></span>
              )}
              {campaign.messageInterval ? (
                <span className="text-xs text-gray-400">{campaign.messageInterval}s interval</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <Link href={`/campaigns/${id}/logs`}>
              <Button variant="secondary" size="sm">View Logs</Button>
            </Link>
            {campaign.status === "draft" && (
              <Link href={`/campaigns/${id}/edit`}>
                <Button variant="secondary" size="sm">Edit</Button>
              </Link>
            )}
            {campaign.status === "running" && (
              <Button variant="secondary" size="sm" onClick={() => { void doAction("pause"); }} disabled={acting}>Pause</Button>
            )}
            {campaign.status === "paused" && (
              <Button size="sm" onClick={() => { void doAction("resume"); }} disabled={acting}>Resume</Button>
            )}
            {campaign.status === "running" && (
              <Button variant="destructive" size="sm" onClick={() => { void doAction("abort"); }} disabled={acting}>Abort</Button>
            )}
            {!campaign.isArchived && (campaign.status === "completed" || campaign.status === "aborted") && (
              <Button variant="secondary" size="sm" onClick={() => { void doAction("archive"); }} disabled={acting}>Archive</Button>
            )}
            {campaign.isArchived && (
              <Button variant="secondary" size="sm" onClick={() => { void doAction("unarchive"); }} disabled={acting}>Unarchive</Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {(campaign.status === "running" || campaign.status === "completed" || campaign.status === "aborted") && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-gray-700">Progress</span>
              <span className="font-bold text-gray-900">{livePercentage}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${campaign.status === "aborted" ? "bg-red-500" : "bg-brand-600"}`}
                style={{ width: `${livePercentage}%` }}
              />
            </div>
            <div className="flex gap-5 text-xs text-gray-500">
              <span><span className="font-semibold text-green-600">{liveProgress.sent}</span> sent</span>
              <span><span className="font-semibold text-red-500">{liveProgress.failed}</span> failed</span>
              <span><span className="font-semibold text-gray-700">{liveProgress.total}</span> total</span>
            </div>
          </div>
        )}

        {/* Stats grid — current status of each recipient (WhatsApp advances one stage at a time) */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {([
            { label: "Sent", value: stats.sent, color: "text-gray-900" },
            { label: "Delivered", value: stats.delivered, color: "text-blue-600" },
            { label: "Read", value: stats.read, color: "text-green-600" },
            { label: "Failed", value: stats.failed, color: "text-red-600" },
            { label: "Pending", value: stats.pending, color: "text-yellow-600" },
            { label: "Expired", value: stats.expired, color: "text-gray-400" },
          ] as const).map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-400 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Rates — cumulative across all stages above "sent" */}
        {funnelSent > 0 && (
          <div className="flex gap-6 bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 text-sm">
            <div>
              <span className="text-gray-400">Delivery rate</span>
              <span className="ml-2 font-semibold text-gray-900">{deliveryRate}%</span>
            </div>
            <div className="w-px bg-gray-100" />
            <div>
              <span className="text-gray-400">Read rate</span>
              <span className="ml-2 font-semibold text-gray-900">{readRate}%</span>
            </div>
          </div>
        )}

        {/* Requeue */}
        {stats.failed > 0 && campaign.status !== "running" && (
          <Button variant="secondary" size="sm" onClick={() => { void doAction("requeue-failed"); }} disabled={acting}>
            Requeue {stats.failed} failed {stats.failed === 1 ? "recipient" : "recipients"}
          </Button>
        )}

        {/* Timestamps */}
        <div className="text-xs text-gray-400 space-y-1">
          {campaign.scheduledAt && <p>Scheduled: {new Date(campaign.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>}
          {campaign.sentAt && <p>Sent: {new Date(campaign.sentAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>}
        </div>
      </div>
    </div>
  );
}
