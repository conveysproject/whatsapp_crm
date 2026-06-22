"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccess } from "@/lib/can";

interface AutoReply {
  id: string;
  name: string;
  triggerType: string;
  triggerKeyword: string;
  replyText: string;
  isActive: boolean;
}

type AutoReplyTriggerType = "contains" | "is" | "starts_with" | "ends_with" | "regex";

interface FormState {
  name: string;
  triggerType: AutoReplyTriggerType;
  triggerKeyword: string;
  replyText: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  triggerType: "contains",
  triggerKeyword: "",
  replyText: "",
  isActive: true,
};

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  contains:    "contains",
  is:          "is exactly",
  starts_with: "starts with",
  ends_with:   "ends with",
  regex:       "matches regex",
};

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function AutoRepliesSection(): JSX.Element {
  const { getToken } = useAuth();
  const { user } = useCurrentUser();
  const canManage = canAccess(user, "manage_bot_replies");
  const [replies, setReplies] = useState<AutoReply[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; editing: AutoReply | null }>({ open: false, editing: null });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/auto-replies`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) setReplies((await res.json() as { data: AutoReply[] }).data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate(): void {
    setForm(EMPTY_FORM);
    setModal({ open: true, editing: null });
  }

  function openEdit(ar: AutoReply): void {
    setForm({
      name: ar.name,
      triggerType: ar.triggerType as AutoReplyTriggerType,
      triggerKeyword: ar.triggerKeyword,
      replyText: ar.replyText,
      isActive: ar.isActive,
    });
    setModal({ open: true, editing: ar });
  }

  async function handleSave(): Promise<void> {
    if (!form.name.trim() || !form.triggerKeyword.trim() || !form.replyText.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      const url = modal.editing
        ? `${API_URL}/v1/auto-replies/${modal.editing.id}`
        : `${API_URL}/v1/auto-replies`;
      const method = modal.editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) { setModal({ open: false, editing: null }); await load(); }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string): Promise<void> {
    if (!window.confirm(`Delete "${name}"?`)) return;
    setBusy(id);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/auto-replies/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleDuplicate(id: string): Promise<void> {
    setBusy(id);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/auto-replies/${id}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Auto-Replies</h2>
        {canManage && (
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            + New Auto-Reply
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
        {loading && <p className="px-4 py-8 text-center text-sm text-gray-400">Loading…</p>}
        {!loading && replies.length === 0 && (
          <div className="flex flex-col items-center py-12 gap-2">
            <span className="text-4xl">💬</span>
            <p className="text-sm text-gray-400">No auto-replies yet.</p>
          </div>
        )}
        {replies.map((ar) => (
          <div key={ar.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
            <div>
              <p className="text-sm font-medium text-gray-900">{ar.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Keyword {TRIGGER_TYPE_LABELS[ar.triggerType] ?? ar.triggerType}{" "}
                <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{ar.triggerKeyword}</code>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  ar.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {ar.isActive ? "Active" : "Inactive"}
              </span>
              {canManage && (
                <button
                  onClick={() => openEdit(ar)}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded"
                >
                  Edit
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => void handleDuplicate(ar.id)}
                  disabled={busy === ar.id}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded disabled:opacity-50"
                >
                  {busy === ar.id ? "…" : "Duplicate"}
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => void handleDelete(ar.id, ar.name)}
                  disabled={busy === ar.id}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-100 rounded disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                {modal.editing ? "Edit Auto-Reply" : "New Auto-Reply"}
              </h3>
              <button onClick={() => setModal({ open: false, editing: null })} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Price Enquiry"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Match Type</label>
                  <select
                    value={form.triggerType}
                    onChange={(e) => setForm((f) => ({ ...f, triggerType: e.target.value as AutoReplyTriggerType }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  >
                    {Object.entries(TRIGGER_TYPE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>Message {label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Keyword</label>
                  <input
                    type="text"
                    value={form.triggerKeyword}
                    onChange={(e) => setForm((f) => ({ ...f, triggerKeyword: e.target.value }))}
                    placeholder="e.g. price"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Reply Message</label>
                <textarea
                  rows={4}
                  value={form.replyText}
                  onChange={(e) => setForm((f) => ({ ...f, replyText: e.target.value }))}
                  placeholder="Hello {{first_name}}, our price is…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ar-active"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="ar-active" className="text-sm text-gray-700">Active</label>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setModal({ open: false, editing: null })}
                className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={!form.name.trim() || !form.triggerKeyword.trim() || !form.replyText.trim() || saving}
                className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : modal.editing ? "Save Changes" : "Create Auto-Reply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
