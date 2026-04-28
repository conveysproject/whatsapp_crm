"use client";

import { JSX, FormEvent, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TagInput } from "./TagInput";

export interface Contact {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
  lifecycleStage: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (contact: Contact) => void;
}

const STAGES = ["lead", "prospect", "customer", "loyal", "churned"];
const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function AddContactModal({ open, onClose, onCreated }: Props): JSX.Element | null {
  const { getToken } = useAuth();
  const [form, setForm] = useState({
    phoneNumber: "",
    name: "",
    email: "",
    lifecycleStage: "lead",
    tags: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  function reset() {
    setForm({ phoneNumber: "", name: "", email: "", lifecycleStage: "lead", tags: [] });
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.phoneNumber.trim()) { setError("Phone number is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify(form),
      });
      const json = await res.json() as { data?: Contact; error?: { message: string } };
      if (!res.ok) { setError(json.error?.message ?? "Failed to create contact."); return; }
      reset();
      onCreated(json.data!);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add Contact</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <Input
            label="Phone Number *"
            value={form.phoneNumber}
            onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
            placeholder="+1 234 567 8900"
          />
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Full name"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="email@example.com"
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Lifecycle Stage</label>
            <select
              value={form.lifecycleStage}
              onChange={(e) => setForm((f) => ({ ...f, lifecycleStage: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Tags</label>
            <TagInput tags={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create Contact"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
