"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toast, useToast } from "@/components/ui/Toast";
import { LabelBadge } from "@/components/ui/LabelBadge";
import type { Label } from "./page";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

const DEFAULT_COLORS = [
  { bg: "#6366f1", text: "#ffffff" },
  { bg: "#10b981", text: "#ffffff" },
  { bg: "#f59e0b", text: "#ffffff" },
  { bg: "#ef4444", text: "#ffffff" },
  { bg: "#3b82f6", text: "#ffffff" },
  { bg: "#8b5cf6", text: "#ffffff" },
  { bg: "#ec4899", text: "#ffffff" },
  { bg: "#64748b", text: "#ffffff" },
];

interface Props {
  initialLabels: Label[];
}

export function LabelsClient({ initialLabels }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [labels, setLabels] = useState<Label[]>(initialLabels);
  const [title, setTitle] = useState("");
  const [textColor, setTextColor] = useState("#ffffff");
  const [bgColor, setBgColor] = useState("#6366f1");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast, toastState, setToastOpen } = useToast();

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/labels`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), textColor, bgColor }),
      });
      if (res.ok) {
        const { data } = await res.json() as { data: Label };
        setLabels((prev) => [...prev, data]);
        setTitle("");
        toast("Label created", { variant: "success" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/labels/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      if (res.ok) {
        const { data } = await res.json() as { data: Label };
        setLabels((prev) => prev.map((l) => (l.id === id ? data : l)));
        setEditingId(null);
        toast("Label updated", { variant: "success" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/labels/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setLabels((prev) => prev.filter((l) => l.id !== id));
      toast("Label deleted", { variant: "success" });
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Create Label</h2>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Label name</label>
            <Input
              placeholder="e.g. VIP, Hot Lead, Follow-up…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Text</label>
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)}
              className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Background</label>
            <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
              className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5" />
          </div>
          <Button onClick={() => void handleCreate()} disabled={!title.trim() || saving}>
            Add Label
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {DEFAULT_COLORS.map((c) => (
            <button
              key={c.bg}
              type="button"
              onClick={() => { setBgColor(c.bg); setTextColor(c.text); }}
              className="w-6 h-6 rounded-full border-2 transition-all"
              style={{
                backgroundColor: c.bg,
                borderColor: bgColor === c.bg ? "#1e293b" : "transparent",
              }}
            />
          ))}
        </div>

        {title && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            Preview:
            <LabelBadge label={{ id: "preview", title, textColor, bgColor }} />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        {labels.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">
            No labels yet. Create your first label above.
          </div>
        ) : (
          labels.map((label) => (
            <div key={label.id} className="flex items-center gap-4 px-6 py-3">
              <LabelBadge label={label} />
              {editingId === label.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleUpdate(label.id); if (e.key === "Escape") setEditingId(null); }}
                    className="h-7 text-sm"
                    autoFocus
                  />
                  <Button variant="secondary" onClick={() => void handleUpdate(label.id)} disabled={saving}>
                    Save
                  </Button>
                  <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              ) : (
                <span className="flex-1 text-sm text-gray-700">{label.title}</span>
              )}
              {editingId !== label.id && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingId(label.id); setEditTitle(label.title); }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(label.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Toast
        title={toastState.title}
        variant={toastState.variant}
        open={toastState.open}
        onOpenChange={setToastOpen}
      />
    </>
  );
}
