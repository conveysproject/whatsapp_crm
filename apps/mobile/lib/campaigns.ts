export type DisplayStatus = "draft" | "upcoming" | "scheduled" | "running" | "paused" | "completed" | "cancelled" | "aborted";
export interface Campaign { id: string; name: string; status: string; displayStatus: DisplayStatus; scheduledAt: string | null; sentAt: string | null; createdAt: string; isArchived: boolean }
export interface CampaignStats { sent: number; accepted: number; delivered: number; played: number; read: number; failed: number; pending: number; expired: number }

const STYLE: Record<DisplayStatus, { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "#F3F4F6", fg: "#374151" },
  upcoming: { label: "Scheduled", bg: "#DBEAFE", fg: "#1E40AF" },
  scheduled: { label: "Scheduled", bg: "#DBEAFE", fg: "#1E40AF" },
  running: { label: "Running", bg: "#DCFCE7", fg: "#166534" },
  paused: { label: "Paused", bg: "#FEF3C7", fg: "#92400E" },
  completed: { label: "Completed", bg: "#F3F4F6", fg: "#374151" },
  cancelled: { label: "Cancelled", bg: "#F3F4F6", fg: "#374151" },
  aborted: { label: "Aborted", bg: "#FEE2E2", fg: "#991B1B" },
};

export function statusStyle(s: DisplayStatus): { label: string; bg: string; fg: string } {
  return STYLE[s] ?? STYLE.draft;
}

export function availableActions(s: DisplayStatus, stats: CampaignStats | null): ("pause" | "resume" | "abort" | "retry")[] {
  const out: ("pause" | "resume" | "abort" | "retry")[] = [];
  if (s === "running") out.push("pause", "abort");
  if (s === "paused") out.push("resume");
  if (stats && stats.failed > 0 && s !== "running") out.push("retry");
  return out;
}

export function progress(stats: CampaignStats): { done: number; total: number; percent: number } {
  const done = stats.sent + stats.accepted + stats.delivered + stats.played + stats.read + stats.failed + stats.expired;
  const total = done + stats.pending;
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}
