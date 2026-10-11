"use client";

import type { JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/message-usage";

interface Prefs { step50: boolean; step80: boolean; step95: boolean; step100: boolean; newBand: boolean; email: boolean; inApp: boolean }
const ALL_ON: Prefs = { step50: true, step80: true, step95: true, step100: true, newBand: true, email: true, inApp: true };
const KEYS = Object.keys(ALL_ON) as Array<keyof Prefs>;

function normalize(raw: unknown): Prefs {
  const out = { ...ALL_ON };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const k of KEYS) if (typeof (raw as Record<string, unknown>)[k] === "boolean") out[k] = (raw as Record<string, boolean>)[k]!;
  }
  return out;
}

const WHEN: Array<{ key: keyof Prefs; label: string }> = [
  { key: "step50", label: "50% of the free allowance" },
  { key: "step80", label: "80%" },
  { key: "step95", label: "95%" },
  { key: "step100", label: "100% and every new band" },
];

/** Usage alert choices for the organization: which thresholds, and whether to be told by email and in the app. Saves on every change. */
export function AlertPreferences(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["billing-alert-prefs"],
    queryFn: async ({ signal }) => {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/v1/billing/alert-preferences`, { headers: { Authorization: `Bearer ${token ?? ""}` }, signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return normalize(((await res.json()) as { data?: unknown }).data);
    },
    retry: false,
  });
  const save = useMutation({
    mutationFn: async (p: Prefs) => {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/v1/billing/alert-preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify(p),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return normalize(((await res.json()) as { data?: unknown }).data);
    },
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: ["billing-alert-prefs"] });
      const prev = qc.getQueryData<Prefs>(["billing-alert-prefs"]);
      qc.setQueryData(["billing-alert-prefs"], p);
      return { prev };
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(["billing-alert-prefs"], ctx.prev); },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["billing-message-usage"] }); },
  });

  if (q.isError) return <p className="text-sm text-gray-500">Alert preferences are unavailable right now.</p>;
  const prefs = q.data ?? ALL_ON;
  const toggle = (key: keyof Prefs) => (e: { target: { checked: boolean } }): void => save.mutate({ ...prefs, [key]: e.target.checked });
  const box = "h-4 w-4 accent-green-700";

  return (
    <div data-testid="alert-preferences">
      <p className="text-sm text-gray-600 mb-3">Get a heads-up before your bill changes. Sent to billing admins.</p>
      <fieldset className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-800">
        <legend className="sr-only">Tell me at</legend>
        {WHEN.map((w) => (
          <label key={w.key} className="flex items-center gap-2">
            <input type="checkbox" className={box} checked={prefs[w.key]} onChange={toggle(w.key)} disabled={q.isPending} />
            {w.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-800">
        <legend className="sr-only">Tell me by</legend>
        <label className="flex items-center gap-2"><input type="checkbox" className={box} checked={prefs.email} onChange={toggle("email")} disabled={q.isPending} /> Email</label>
        <label className="flex items-center gap-2"><input type="checkbox" className={box} checked={prefs.inApp} onChange={toggle("inApp")} disabled={q.isPending} /> In the app</label>
        <label className="flex items-center gap-2"><input type="checkbox" className={box} checked={prefs.newBand} onChange={toggle("newBand")} disabled={q.isPending} /> New band reached</label>
      </fieldset>
      {save.isError && <p role="alert" className="mt-2 text-sm text-red-700">Could not save. Please try again.</p>}
    </div>
  );
}
