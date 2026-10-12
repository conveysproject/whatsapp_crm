"use client";

import { useState, type JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Row {
  organizationId: string;
  name: string;
  status: "requested" | "approved";
  reason: string | null;
  requestedAt: string;
  approvedAt: string | null;
  deleteAfter: string | null;
}

const day = (iso: string | null): string => (iso ? iso.slice(0, 10) : "-");

/** Cancellation requests to approve or dismiss, and approved cancellations (delete date, reactivate). */
export function CancellationsPanel(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}`, ...init?.headers } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  const q = useQuery<{ data: Row[] }>({ queryKey: ["admin-billing-cancellations"], queryFn: () => call("/v1/admin/billing/cancellations") });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reopen" }) =>
      call<{ data: { finalStatement?: { created: boolean; status?: string; reason?: string } | null } }>(`/v1/admin/billing/cancellations/${encodeURIComponent(id)}/${action}`, { method: "POST", body: "{}" }),
    onSuccess: (res, v) => {
      if (v.action === "approve") {
        const fs = res.data.finalStatement;
        toast.success(fs?.created ? `Cancelled. Final statement ${fs.status === "issued" ? "issued with a payment link" : "created (no payment due)"}.` : "Cancelled. No final statement was needed.");
      } else {
        toast.success("Account reopened. Sending resumes within a minute.");
      }
      void qc.invalidateQueries({ queryKey: ["admin-billing-cancellations"] });
    },
    onError: () => toast.error("That change is not allowed (it may already be done)"),
    onSettled: () => setBusy(null),
  });
  const run = (id: string, action: "approve" | "reopen", confirmText: string): void => {
    if (!window.confirm(confirmText)) return;
    setBusy(id);
    act.mutate({ id, action });
  };

  const rows = q.data?.data ?? [];
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900">Cancellation requests</h2>
      <p className="text-sm text-gray-500 mt-1">
        Approving stops the customer&apos;s sending straight away, issues their final statement (same bands, messages counted so far) and starts their 30 days to export data.
        After 30 days you delete their data by hand; the daily summary email reminds you.
      </p>
      {q.isError && <p className="text-sm text-red-600 mt-3">Could not load.</p>}
      <div className="overflow-x-auto bg-white border rounded mt-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr><th className="p-2">Customer</th><th className="p-2">Status</th><th className="p-2">Requested</th><th className="p-2">Reason</th><th className="p-2">Delete data after</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.organizationId} className="border-t align-top">
                <td className="p-2">{r.name}</td>
                <td className="p-2">{r.status === "requested" ? "Waiting for approval" : "Cancelled"}</td>
                <td className="p-2">{day(r.requestedAt)}</td>
                <td className="p-2 max-w-xs break-words">{r.reason ?? "-"}</td>
                <td className="p-2">{day(r.deleteAfter)}</td>
                <td className="p-2 space-x-1 whitespace-nowrap">
                  {r.status === "requested" && (
                    <button type="button" disabled={busy === r.organizationId} onClick={() => run(r.organizationId, "approve", `Approve the cancellation of ${r.name}? Sending stops now and the final statement is issued.`)} className="text-xs bg-red-700 text-white rounded px-2 py-0.5">Approve</button>
                  )}
                  <button type="button" disabled={busy === r.organizationId} onClick={() => run(r.organizationId, "reopen", r.status === "requested" ? `Dismiss the request from ${r.name}?` : `Reactivate ${r.name}? Sending resumes. Their final statement stays as it is.`)} className="text-xs border rounded px-2 py-0.5">
                    {r.status === "requested" ? "Dismiss" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-500">No cancellation requests.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
