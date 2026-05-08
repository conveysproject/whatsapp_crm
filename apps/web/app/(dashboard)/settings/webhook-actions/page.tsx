"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface WebhookAction {
  id: string;
  title: string;
  conditionKey: string;
  conditionValue: string;
  templateId: string | null;
  isActive: boolean;
}

interface Template {
  id: string;
  name: string;
}

export default function WebhookActionsPage(): JSX.Element {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", conditionKey: "", conditionValue: "", templateId: "" });

  const { data: actions } = useQuery<{ data: WebhookAction[] }>({
    queryKey: ["webhook-actions"],
    queryFn: () => fetch("/api/v1/webhook-actions").then((r) => r.json()),
  });

  const { data: templates } = useQuery<{ data: Template[] }>({
    queryKey: ["templates"],
    queryFn: () => fetch("/api/v1/templates").then((r) => r.json()),
  });

  const create = useMutation({
    mutationFn: () =>
      fetch("/api/v1/webhook-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, templateId: form.templateId || undefined }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook-actions"] });
      setCreating(false);
      setForm({ title: "", conditionKey: "", conditionValue: "", templateId: "" });
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetch(`/api/v1/webhook-actions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-actions"] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => fetch(`/api/v1/webhook-actions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-actions"] }),
  });

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Webhook Actions</h1>
          <p className="text-sm text-gray-500 mt-1">When an inbound webhook payload matches a condition, auto-send a WhatsApp template to the contact.</p>
        </div>
        <button onClick={() => setCreating(true)} className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700">
          New Rule
        </button>
      </div>

      {creating && (
        <div className="border rounded-lg p-5 space-y-4 bg-gray-50">
          <h2 className="font-medium text-sm">New Webhook Action</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Rule Name</label>
              <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="e.g. Payment Received" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Payload Field (condition key)</label>
              <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="e.g. event" value={form.conditionKey} onChange={(e) => setForm((f) => ({ ...f, conditionKey: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Expected Value</label>
              <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="e.g. payment_received" value={form.conditionValue} onChange={(e) => setForm((f) => ({ ...f, conditionValue: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Template to Send</label>
              <select className="w-full border rounded px-3 py-1.5 text-sm" value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}>
                <option value="">Select template...</option>
                {(templates?.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => create.mutate()} disabled={!form.title || !form.conditionKey || !form.conditionValue || create.isPending} className="px-4 py-2 bg-green-600 text-white text-sm rounded disabled:opacity-50">
              {create.isPending ? "Saving..." : "Save Rule"}
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 border text-sm rounded">Cancel</button>
          </div>
        </div>
      )}

      <div className="border rounded-lg divide-y">
        {(actions?.data ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">No webhook actions yet.</p>
        )}
        {(actions?.data ?? []).map((action) => (
          <div key={action.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-sm">{action.title}</p>
              <p className="text-xs text-gray-500">
                When <code className="bg-gray-100 px-1 rounded">{action.conditionKey}</code> = <code className="bg-gray-100 px-1 rounded">{action.conditionValue}</code>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a href={`/settings/webhook-actions/${action.id}/logs`} className="text-xs text-blue-600 hover:underline">Logs</a>
              <button
                onClick={() => toggle.mutate({ id: action.id, isActive: !action.isActive })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${action.isActive ? "bg-green-500" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${action.isActive ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
              <button onClick={() => { if (confirm("Delete this rule?")) del.mutate(action.id); }} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-200 rounded">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
