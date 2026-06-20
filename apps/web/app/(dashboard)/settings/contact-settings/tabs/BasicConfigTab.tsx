"use client";

import { JSX, useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLeadStatuses } from "@/hooks/useLeadStatuses";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface ContactConfig {
  defaultLeadStatusId: string | null;
  closureLeadStatusIds: string[];
  closureDeadlineDays: number | null;
}

export default function BasicConfigTab(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { data: leadStatuses } = useLeadStatuses();

  const { data: config } = useQuery<ContactConfig>({
    queryKey: ["org-me"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/organizations/me`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      const json = (await res.json()) as { data?: { settings?: { contactConfig?: Partial<ContactConfig> } } };
      const cc = json.data?.settings?.contactConfig ?? {};
      return { defaultLeadStatusId: cc.defaultLeadStatusId ?? null, closureLeadStatusIds: cc.closureLeadStatusIds ?? [], closureDeadlineDays: cc.closureDeadlineDays ?? null };
    },
  });

  const [defaultId, setDefaultId] = useState<string>("");
  const [closureIds, setClosureIds] = useState<string[]>([]);
  const [deadlineDays, setDeadlineDays] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const [closureOpen, setClosureOpen] = useState(false);
  const closureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (closureRef.current && !closureRef.current.contains(e.target as Node)) setClosureOpen(false);
    }
    if (closureOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [closureOpen]);

  useEffect(() => {
    if (config) {
      setDefaultId(config.defaultLeadStatusId ?? "");
      setClosureIds(config.closureLeadStatusIds ?? []);
      setDeadlineDays(config.closureDeadlineDays != null ? String(config.closureDeadlineDays) : "");
    }
  }, [config]);

  const save = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/organizations/me`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { contactConfig: { defaultLeadStatusId: defaultId || null, closureLeadStatusIds: closureIds, closureDeadlineDays: deadlineDays.trim() ? Math.max(0, parseInt(deadlineDays, 10) || 0) : null } } }),
      });
      if (!res.ok) throw new Error("Failed to save");
    },
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); void qc.invalidateQueries({ queryKey: ["org-me"] }); },
  });

  function toggleClosure(id: string) {
    setClosureIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Default Status */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Default Status for New Contacts</h3>
        <select
          value={defaultId}
          onChange={(e) => setDefaultId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">— None —</option>
          {leadStatuses.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500">
          New contacts created without an explicit status are assigned this status by default.
        </p>
      </section>

      {/* Closure Statuses */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Select Closure Statuses</h3>
        <div className="relative" ref={closureRef}>
          <button
            type="button"
            onClick={() => setClosureOpen((v) => !v)}
            className="w-full flex items-center justify-between rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <span className="flex items-center gap-1.5 flex-wrap min-h-[1.25rem]">
              {closureIds.length === 0 ? (
                <span className="text-gray-400">Select statuses…</span>
              ) : (
                closureIds.map((id) => {
                  const s = leadStatuses.find((x) => x.id === id);
                  return s ? (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  ) : null;
                })
              )}
            </span>
            <svg className={`w-4 h-4 text-gray-400 shrink-0 ml-2 transition-transform ${closureOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {closureOpen && (
            <div className="absolute z-20 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
              {leadStatuses.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-400">No statuses defined yet.</p>
              ) : (
                <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
                  {leadStatuses.map((s) => {
                    const checked = closureIds.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClosure(s.id)}
                          className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                        />
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-sm text-gray-800">{s.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Statuses that mark a contact as closed/terminal in your sales cycle.
        </p>
      </section>

      {/* Closure Deadline */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Default Closure Deadline</h3>
        <input
          type="number"
          min={0}
          value={deadlineDays}
          onChange={(e) => setDeadlineDays(e.target.value)}
          placeholder="Enter No. of Days from Creation Date"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <p className="text-xs text-gray-500">
          A contact&apos;s closure deadline is its creation date plus this many days. If the contact
          isn&apos;t in a closure status by then, the account owner is alerted. Leave blank to disable.
        </p>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved ✓</span>}
      </div>
    </div>
  );
}
