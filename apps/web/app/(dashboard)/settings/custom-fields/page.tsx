"use client";

import { JSX, useState, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface CustomField {
  id: string;
  inputName: string;
  inputType: string;
  isActive: boolean;
  createdAt: string;
}

const INPUT_TYPES = [
  { value: "text",           label: "Text" },
  { value: "number",         label: "Number" },
  { value: "email",          label: "Email" },
  { value: "url",            label: "URL" },
  { value: "date",           label: "Date" },
  { value: "time",           label: "Time" },
  { value: "datetime-local", label: "Date and Time Local" },
  { value: "select",         label: "Select" },
  { value: "boolean",        label: "Boolean" },
] as const;

export default function CustomFieldsPage(): JSX.Element {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ inputName: "", inputType: "text" });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const { data: fields = [], isLoading } = useQuery<CustomField[]>({
    queryKey: ["custom-fields"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/custom-fields`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: CustomField[] }).data;
    },
  });

  async function handleAdd() {
    if (!form.inputName) return;
    setSaving(true);
    const token = await getToken();
    await fetch(`${API_URL}/v1/contacts/custom-fields`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setAddOpen(false);
    setForm({ inputName: "", inputType: "text" });
    void queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const token = await getToken();
    await fetch(`${API_URL}/v1/contacts/custom-fields/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    setDeletingId(null);
    void queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custom Fields</h1>
          <p className="text-sm text-gray-500 mt-1">Add custom data fields to contacts.</p>
        </div>
        <button
          onClick={() => { setAddOpen(true); setTimeout(() => nameRef.current?.focus(), 50); }}
          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
        >
          Add Field
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-400 text-center">Loading…</p>
        ) : fields.length === 0 ? (
          <p className="p-8 text-sm text-gray-400 text-center">No custom fields yet.</p>
        ) : (
          fields.map((f) => (
            <div key={f.id} className="flex items-center justify-between px-4 py-3 gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{f.inputName}</p>
                <p className="text-xs text-gray-500">{INPUT_TYPES.find((t) => t.value === f.inputType)?.label ?? f.inputType}</p>
              </div>
              <button
                onClick={() => { void handleDelete(f.id); }}
                disabled={deletingId === f.id}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
              >
                {deletingId === f.id ? "Removing…" : "Remove"}
              </button>
            </div>
          ))
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Add Custom Field</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Field Name *</label>
                <input
                  ref={nameRef}
                  value={form.inputName}
                  onChange={(e) => setForm((f) => ({ ...f, inputName: e.target.value }))}
                  className="w-full border rounded px-3 py-1.5 text-sm"
                  placeholder="e.g. Company Size"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Field Type</label>
                <select
                  value={form.inputType}
                  onChange={(e) => setForm((f) => ({ ...f, inputType: e.target.value }))}
                  className="w-full border rounded px-3 py-1.5 text-sm"
                >
                  {INPUT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setAddOpen(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => { void handleAdd(); }}
                disabled={saving || !form.inputName}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
