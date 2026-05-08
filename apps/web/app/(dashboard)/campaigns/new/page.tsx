"use client";

import { JSX, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { WhatsAppGate } from "@/components/WhatsAppGate";

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
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [campaignType, setCampaignType] = useState<"template" | "non_template">("template");
  const [freeTextBody, setFreeTextBody] = useState("");

  const { data: groupsData } = useQuery<{ data: Array<{ id: string; title: string; _count: { contacts: number } }> }>({
    queryKey: ["contact-groups"],
    queryFn: () => fetch("/api/v1/contact-groups").then((r) => r.json()),
  });

  const { data: countData } = useQuery<{ data: { count: number } }>({
    queryKey: ["targeted-count", selectedGroupIds],
    queryFn: () =>
      fetch(`/api/v1/campaigns/preview/targeted-count?groupIds=${selectedGroupIds.join(",")}`).then((r) => r.json()),
    enabled: selectedGroupIds.length > 0,
  });

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
        body: JSON.stringify({
          name: form.name,
          templateId: campaignType === "template" ? form.templateId : undefined,
          campaignType,
          freeTextBody: campaignType === "non_template" ? freeTextBody : undefined,
        }),
      });
      if (!createRes.ok) return;
      const { data } = await createRes.json() as { data: { id: string } };

      await fetch(`${api}/v1/campaigns/${data.id}/schedule`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentId: form.segmentId,
          groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
          scheduledAt: form.scheduledAt || undefined,
        }),
      });
      router.push("/campaigns");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WhatsAppGate feature="Campaigns">
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
      {/* Campaign Type */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Campaign Type</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              value="template"
              checked={campaignType === "template"}
              onChange={() => setCampaignType("template")}
            />
            Template message
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              value="non_template"
              checked={campaignType === "non_template"}
              onChange={() => setCampaignType("non_template")}
            />
            Free text message
          </label>
        </div>
        {campaignType === "non_template" && (
          <textarea
            className="w-full border rounded px-3 py-2 text-sm"
            rows={4}
            placeholder="Type your message..."
            value={freeTextBody}
            onChange={(e) => setFreeTextBody(e.target.value)}
          />
        )}
      </div>

      {/* Target Groups */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Target Groups</label>
        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded p-2">
          {(groupsData?.data ?? []).map((g) => (
            <label key={g.id} className="flex items-center gap-2 text-sm p-1 rounded hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedGroupIds.includes(g.id)}
                onChange={(e) =>
                  setSelectedGroupIds((prev) =>
                    e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id)
                  )
                }
                className="rounded"
              />
              {g.title} <span className="text-xs text-gray-400">({g._count.contacts})</span>
            </label>
          ))}
          {(groupsData?.data ?? []).length === 0 && (
            <p className="col-span-2 text-xs text-gray-400 p-1">No contact groups yet.</p>
          )}
        </div>
        {selectedGroupIds.length > 0 && countData && (
          <p className="text-sm text-green-700 font-medium">
            {countData.data.count.toLocaleString()} contacts will receive this campaign
          </p>
        )}
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
        disabled={
          !form.name ||
          (campaignType === "template" ? !form.templateId : !freeTextBody) ||
          !form.segmentId ||
          saving
        }
      >
        {saving ? "Scheduling…" : "Schedule Campaign"}
      </Button>
      </div>
    </WhatsAppGate>
  );
}
