"use client";

import { JSX, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { LabelBadge, type LabelItem } from "@/components/ui/LabelBadge";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Props {
  contactId: string;
}

export function ContactLabelManager({ contactId }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [allLabels, setAllLabels] = useState<LabelItem[]>([]);
  const [assigned, setAssigned] = useState<LabelItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const [allRes, assignedRes] = await Promise.all([
        fetch(`${API_URL}/v1/labels`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/v1/contacts/${contactId}/labels`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (allRes.ok) setAllLabels((await allRes.json() as { data: LabelItem[] }).data);
      if (assignedRes.ok) setAssigned((await assignedRes.json() as { data: LabelItem[] }).data);
    })();
  }, [contactId, getToken]);

  async function assign(label: LabelItem) {
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/contacts/${contactId}/labels`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ labelIds: [label.id] }),
    });
    if (res.ok) setAssigned((prev) => [...prev, label]);
  }

  async function unassign(labelId: string) {
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/contacts/${contactId}/labels/${labelId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setAssigned((prev) => prev.filter((l) => l.id !== labelId));
  }

  const unassignedLabels = allLabels.filter((l) => !assigned.some((a) => a.id === l.id));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Labels</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-brand-600 hover:underline"
        >
          {open ? "Done" : "+ Add"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {assigned.length === 0 && !open && (
          <span className="text-xs text-gray-400">No labels assigned</span>
        )}
        {assigned.map((label) => (
          <LabelBadge key={label.id} label={label} onRemove={(id) => void unassign(id)} />
        ))}
      </div>

      {open && unassignedLabels.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5 p-2 rounded-lg border border-gray-200 bg-gray-50">
          {unassignedLabels.map((label) => (
            <button
              key={label.id}
              type="button"
              onClick={() => void assign(label)}
              className="transition-opacity hover:opacity-80"
            >
              <LabelBadge label={label} />
            </button>
          ))}
        </div>
      )}

      {open && unassignedLabels.length === 0 && (
        <p className="text-xs text-gray-400 mt-1">All labels are assigned.</p>
      )}
    </div>
  );
}
