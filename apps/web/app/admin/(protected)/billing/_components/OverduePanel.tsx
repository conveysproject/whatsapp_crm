"use client";

import { useState, type JSX } from "react";
import { useAuth } from "@/lib/auth/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface OverdueOrg {
  organizationId: string;
  name: string;
  statements: Array<{ month: string; dueAt: string; hasLink: boolean; amountMinor: number | null; currency: string | null }>;
  state: "ok" | "overdue" | "blocked";
  blockAt: string | null;
  exempt: boolean;
  manualExempt: boolean;
  pauseUntil: string | null;
}
interface OverdueResponse { mode: "off" | "watch" | "enforce"; organizations: OverdueOrg[] }

const MODE_TEXT: Record<string, string> = {
  off: "Blocking is OFF: nothing is warned or blocked.",
  watch: "Watch mode: customers are warned and recorded, but nothing is blocked yet.",
  enforce: "Enforcing: sending is refused 7 days after the due date.",
};

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "-";
}

function plusDays(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

/** Customers with an overdue statement, what would happen to them, and the pause / exempt controls. */
export function OverduePanel(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}`, ...init?.headers } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  const q = useQuery<{ data: OverdueResponse }>({ queryKey: ["admin-billing-overdue"], queryFn: () => call("/v1/admin/billing/overdue") });
  const save = useMutation({
    mutationFn: (v: { organizationId: string; exempt?: boolean; pauseUntil?: string | null }) =>
      call("/v1/admin/billing/org-block", { method: "PUT", body: JSON.stringify(v) }),
    onSuccess: () => { toast.success("Saved"); void qc.invalidateQueries({ queryKey: ["admin-billing-overdue"] }); },
    onError: () => toast.error("Could not save"),
    onSettled: () => setBusy(null),
  });
  const run = (organizationId: string, patch: { exempt?: boolean; pauseUntil?: string | null }): void => {
    setBusy(organizationId);
    save.mutate({ organizationId, ...patch });
  };

  const data = q.data?.data;
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900">Overdue customers</h2>
      <p className="text-sm text-gray-500 mt-1">
        {data ? MODE_TEXT[data.mode] : "Loading..."} A customer is blocked 7 days after a statement&apos;s due date, only if the statement has a payment link.
        Pausing or exempting a customer lifts the block within a minute.
      </p>
      {q.isError && <p className="text-sm text-red-600 mt-3">Could not load.</p>}
      {data && (
        <div className="overflow-x-auto bg-white border rounded mt-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr><th className="p-2">Customer</th><th className="p-2">Overdue statements</th><th className="p-2">Status</th><th className="p-2">Block date</th><th className="p-2">Override</th></tr>
            </thead>
            <tbody>
              {data.organizations.map((o) => (
                <tr key={o.organizationId} className="border-t align-top">
                  <td className="p-2">{o.name}</td>
                  <td className="p-2">
                    {o.statements.map((s) => (
                      <div key={s.month}>{s.month}, due {day(s.dueAt)}{s.hasLink ? "" : " (no payment link yet: never blocked)"}</div>
                    ))}
                  </td>
                  <td className="p-2">
                    {o.exempt ? "Exempt or paused" : o.state === "blocked" ? (data.mode === "enforce" ? "BLOCKED" : "Would be blocked") : o.state === "overdue" ? "Overdue, in grace period" : "OK"}
                  </td>
                  <td className="p-2">{day(o.blockAt)}</td>
                  <td className="p-2 space-x-1 whitespace-nowrap">
                    {o.pauseUntil ? (
                      <button type="button" disabled={busy === o.organizationId} onClick={() => run(o.organizationId, { pauseUntil: null })} className="text-xs border rounded px-2 py-0.5">Clear pause (until {o.pauseUntil})</button>
                    ) : (
                      <button type="button" disabled={busy === o.organizationId} onClick={() => run(o.organizationId, { pauseUntil: plusDays(7) })} className="text-xs border rounded px-2 py-0.5">Pause 7 days</button>
                    )}
                    <button type="button" disabled={busy === o.organizationId} onClick={() => run(o.organizationId, { exempt: !o.manualExempt })} className="text-xs border rounded px-2 py-0.5">
                      {o.manualExempt ? "Remove exemption" : "Exempt"}
                    </button>
                  </td>
                </tr>
              ))}
              {data.organizations.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-gray-500">No overdue statements.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
