"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface Option {
  id: string;
  name: string;
}

export default function NewCampaignPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [templates, setTemplates] = useState<Option[]>([]);
  const [segments, setSegments] = useState<Option[]>([]);
  const [form, setForm] = useState({ name: "", templateId: "", segmentId: "", scheduledAt: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const [tRes, sRes] = await Promise.all([
        fetch(`${api}/v1/templates`, { headers: { Authorization: `Bearer ${token ?? ""}` } }),
        fetch(`${api}/v1/segments`, { headers: { Authorization: `Bearer ${token ?? ""}` } }),
      ]);
      if (tRes.ok) setTemplates((await tRes.json() as { data: Option[] }).data);
      if (sRes.ok) setSegments((await sRes.json() as { data: Option[] }).data);
    }
    void load();
  }, [getToken]);

  async function handleSubmit() {
    setSaving(true);
    try {
      const token = await getToken();
      const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const createRes = await fetch(`${api}/v1/campaigns`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, templateId: form.templateId }),
      });
      if (!createRes.ok) return;
      const { data } = await createRes.json() as { data: { id: string } };

      await fetch(`${api}/v1/campaigns/${data.id}/schedule`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentId: form.segmentId,
          scheduledAt: form.scheduledAt || undefined,
        }),
      });
      router.push("/campaigns");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">New Campaign</h1>
      <Input
        label="Campaign Name"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
      />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Template</label>
        <select
          value={form.templateId}
          onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Select a template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Audience Segment</label>
        <select
          value={form.segmentId}
          onChange={(e) => setForm((f) => ({ ...f, segmentId: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Select a segment…</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <Input
        label="Schedule At (optional)"
        type="datetime-local"
        value={form.scheduledAt}
        onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
      />
      <Button
        onClick={() => { void handleSubmit(); }}
        disabled={!form.name || !form.templateId || !form.segmentId || saving}
      >
        {saving ? "Scheduling…" : "Schedule Campaign"}
      </Button>
    </div>
  );
}
