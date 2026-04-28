"use client";

import { JSX, FormEvent, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TagInput } from "./TagInput";

interface ContactFormData {
  name: string;
  email: string;
  lifecycleStage: string;
  tags: string[];
}

interface ContactFormProps {
  initial?: Partial<ContactFormData>;
  phoneNumber?: string;
  onSubmit: (data: ContactFormData) => Promise<void>;
  submitLabel?: string;
}

const STAGES = ["lead", "prospect", "customer", "loyal", "churned"];

export function ContactForm({ initial, phoneNumber, onSubmit, submitLabel = "Save" }: ContactFormProps): JSX.Element {
  const [form, setForm] = useState<ContactFormData>({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    lifecycleStage: initial?.lifecycleStage ?? "lead",
    tags: initial?.tags ?? [],
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try { await onSubmit(form); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
      {phoneNumber && (
        <Input label="Phone Number" value={phoneNumber} disabled />
      )}
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
          {STAGES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Tags</label>
        <TagInput tags={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} />
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
