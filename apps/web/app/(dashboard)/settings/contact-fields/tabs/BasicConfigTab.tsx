"use client";

import { JSX, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLeadStatuses } from "@/hooks/useLeadStatuses";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface ContactConfig {
  defaultLeadStatusId: string | null;
  closureLeadStatusIds: string[];
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
      return { defaultLeadStatusId: cc.defaultLeadStatusId ?? null, closureLeadStatusIds: cc.closureLeadStatusIds ?? [] };
    },
  });

  const [defaultId, setDefaultId] = useState<string>("");
  const [closureIds, setClosureIds] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setDefaultId(config.defaultLeadStatusId ?? "");
      setClosureIds(config.closureLeadStatusIds ?? []);
    }
  }, [config]);

  const save = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/organizations/me`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { contactConfig: { defaultLeadStatusId: defaultId || null, closureLeadStatusIds: closureIds } } }),
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
        <div className="flex flex-wrap gap-2">
          {leadStatuses.map((s) => {
            const selected = closureIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleClosure(s.id)}
                className={[
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-colors",
                  selected ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
                ].join(" ")}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selected ? "#fff" : s.color }} />
                {s.name}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">
          Statuses that mark a contact as closed/terminal in your sales cycle.
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
