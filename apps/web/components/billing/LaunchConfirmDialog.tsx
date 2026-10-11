"use client";

import { useEffect, useRef, type JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, fetchMessageUsage, formatCount } from "@/lib/message-usage";
import { buildEstimate } from "@/lib/campaign-estimate";

export interface AudienceChoice {
  mode: "all" | "groups" | "segment";
  groupIds: string[];
  segmentId: string;
}

interface Props {
  open: boolean;
  campaignName: string;
  audience: AudienceChoice;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const TONE: Record<string, string> = {
  green: "bg-green-50 text-green-800",
  amber: "bg-amber-50 text-amber-900",
  plain: "bg-gray-50 text-gray-700",
};

/** "Send 'X' to N contacts?" confirmation with this period's usage. Shown only when billing numbers are available to the user. */
export function LaunchConfirmDialog({ open, campaignName, audience, busy, onCancel, onConfirm }: Props): JSX.Element | null {
  const { getToken } = useAuth();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const usageQ = useQuery({
    queryKey: ["billing-message-usage"],
    queryFn: ({ signal }) => fetchMessageUsage(getToken, signal),
    enabled: open,
    retry: false,
    staleTime: 60_000,
  });
  const sizeQ = useQuery({
    queryKey: ["campaign-audience-size", audience.mode, audience.groupIds, audience.segmentId],
    queryFn: async ({ signal }): Promise<number | null> => {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/v1/campaigns/audience-size`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ mode: audience.mode, groupIds: audience.groupIds, segmentId: audience.segmentId }),
        signal,
      });
      if (!res.ok) return null;
      const n = ((await res.json()) as { data?: { count?: unknown } }).data?.count;
      return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
    },
    enabled: open,
    retry: false,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  const recipients = sizeQ.data ?? null;
  const estimate = usageQ.data ? buildEstimate(usageQ.data, recipients) : null;
  const title = recipients !== null && recipients > 0
    ? `Send "${campaignName}" to ${formatCount(recipients)} contacts?`
    : `Send "${campaignName}"?`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!busy) onCancel(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-confirm-title"
        data-testid="launch-confirm"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900"
      >
        <h2 id="launch-confirm-title" className="text-xl font-bold text-gray-900 dark:text-gray-50 break-words">{title}</h2>
        {estimate ? (
          <div className="mt-4">
            {estimate.rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-gray-100 py-3 text-sm dark:border-gray-800">
                <span className="text-gray-700 dark:text-gray-300">{label}</span>
                <span className="font-bold tabular-nums text-gray-900 dark:text-gray-50">{value}</span>
              </div>
            ))}
            {estimate.footer && <p className={`mt-4 rounded-lg px-4 py-3 text-sm ${TONE[estimate.tone]}`}>{estimate.footer}</p>}
          </div>
        ) : usageQ.isPending ? (
          <p className="mt-4 text-sm text-gray-500">Checking your usage…</p>
        ) : null}
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Messages that fail to send are not counted. WhatsApp&apos;s own charge for this campaign is billed to you by Meta.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="min-h-[44px] rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="min-h-[44px] rounded-lg bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60">
            {busy ? "Sending…" : "Send campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}
