"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import StatusSlideOver, { type StatusDraft } from "./StatusSlideOver";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface LeadStatus {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isClosure: boolean;
}

export default function LeadStatusesTab(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<StatusDraft | null | undefined>(undefined); // undefined=closed, null=add, draft=edit
  const [error, setError] = useState<string | null>(null);

  const { data: statuses = [], isLoading } = useQuery<LeadStatus[]>({
    queryKey: ["lead-statuses"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/lead-statuses`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      if (!res.ok) return [];
      return (await res.json() as { data: LeadStatus[] }).data;
    },
  });

  const save = useMutation({
    mutationFn: async (draft: { name: string; color: string }) => {
      const token = await getToken();
      const isEdit = editing && editing.id;
      const res = await fetch(
        isEdit ? `${API_URL}/v1/lead-statuses/${editing!.id}` : `${API_URL}/v1/lead-statuses`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        }
      );
      if (!res.ok) throw new Error("Failed to save status");
    },
    onSuccess: () => { setEditing(undefined); void qc.invalidateQueries({ queryKey: ["lead-statuses"] }); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/lead-statuses/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token ?? ""}` } });
      if (res.status === 409) throw new Error("This status is assigned to contacts — reassign them before deleting.");
      if (!res.ok) throw new Error("Failed to delete status");
    },
    onSuccess: () => { setError(null); void qc.invalidateQueries({ queryKey: ["lead-statuses"] }); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => { setError(null); setEditing(null); }}
          className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
        >
          Add Status
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-xs font-medium text-gray-500 border-b border-gray-100">
          <span>Status Name</span>
          <span>Colour</span>
        </div>
        {isLoading ? (
          <p className="p-6 text-sm text-gray-400 text-center">Loading…</p>
        ) : statuses.length === 0 ? (
          <p className="p-8 text-sm text-gray-400 text-center">No lead statuses yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {statuses.map((s) => (
              <div key={s.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3">
                <span className="text-sm font-medium text-gray-900">{s.name}</span>
                <span className="w-5 h-5 rounded-full" style={{ backgroundColor: s.color }} />
                <div className="flex items-center gap-3">
                  <button onClick={() => { setError(null); setEditing({ id: s.id, name: s.name, color: s.color }); }} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Edit</button>
                  <button onClick={() => remove.mutate(s.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing !== undefined && (
        <StatusSlideOver
          initial={editing}
          saving={save.isPending}
          onSave={(draft) => save.mutate(draft)}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
