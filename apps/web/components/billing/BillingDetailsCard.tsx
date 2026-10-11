"use client";

import { useState, type JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/message-usage";

interface Details { billingEmail: string; legalName: string; gstin: string; address: string }
const EMPTY: Details = { billingEmail: "", legalName: "", gstin: "", address: "" };

function normalize(raw: unknown): Details {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY;
  const r = raw as Record<string, unknown>;
  const pick = (k: string): string => (typeof r[k] === "string" ? (r[k] as string) : "");
  return { billingEmail: pick("billingEmail"), legalName: pick("legalName"), gstin: pick("gstin"), address: pick("address") };
}

/** "Billing details": where statements are emailed and what appears on them (legal name, GST number, address). */
export function BillingDetailsCard(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Details>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["billing-details"],
    queryFn: async ({ signal }) => {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/v1/billing/details`, { headers: { Authorization: `Bearer ${token ?? ""}` }, signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return normalize(((await res.json()) as { data?: unknown }).data);
    },
    retry: false,
  });

  const save = useMutation({
    mutationFn: async (d: Details) => {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/v1/billing/details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify(d),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return normalize(((await res.json()) as { data?: unknown }).data);
    },
    onSuccess: (d) => { qc.setQueryData(["billing-details"], d); setEditing(false); setError(null); },
    onError: (e: Error) => setError(e.message),
  });

  const d = q.data ?? EMPTY;
  const rows: Array<[string, string]> = [
    ["Billing email", d.billingEmail || "Not set (statements go to your admins)"],
    ["Legal name", d.legalName || "Not set"],
    ["GST number", d.gstin || "Not set"],
    ["Address", d.address || "Not set"],
  ];
  const input = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600";

  return (
    <section data-testid="billing-details" className="flex-1 min-w-[300px] rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Billing details</h2>
      {q.isError ? (
        <p className="mt-2 text-sm text-gray-500">Billing details are unavailable right now.</p>
      ) : !editing ? (
        <>
          <dl className="mt-3 space-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-3"><dt className="w-28 shrink-0 text-gray-500">{k}</dt><dd className="text-gray-900 break-words">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-gray-500">Shown on every statement and invoice.</p>
          <button
            type="button"
            onClick={() => { setForm(d); setError(null); setEditing(true); }}
            className="mt-4 min-h-[44px] rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Edit details
          </button>
        </>
      ) : (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}
        >
          <label className="block text-sm text-gray-700">Billing email
            <input type="email" value={form.billingEmail} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} className={input} />
          </label>
          <label className="block text-sm text-gray-700">Legal name
            <input value={form.legalName} maxLength={120} onChange={(e) => setForm({ ...form, legalName: e.target.value })} className={input} />
          </label>
          <label className="block text-sm text-gray-700">GST number (optional)
            <input value={form.gstin} maxLength={15} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} className={`${input} font-mono`} placeholder="27AAPFU0939F1ZV" />
          </label>
          <label className="block text-sm text-gray-700">Address
            <textarea value={form.address} maxLength={300} rows={3} onChange={(e) => setForm({ ...form, address: e.target.value })} className={input} />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="min-h-[44px] rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="min-h-[44px] rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
