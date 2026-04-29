"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const TRIGGER_TYPES = [
  { value: "new_conversation", label: "New Conversation" },
  { value: "keyword_match",    label: "Keyword Match" },
  { value: "contact_created",  label: "Contact Created" },
  { value: "tag_added",        label: "Tag Added" },
  { value: "lifecycle_change", label: "Lifecycle Stage Changed" },
];

export default function NewFlowPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("new_conversation");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/flows`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          triggerType,
          flowDefinition: { startNodeId: "trigger-1", nodes: [{ id: "trigger-1", type: triggerType, config: {}, next: null }] },
        }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: { message?: string } };
        setError(json.error?.message ?? "Failed to create flow.");
        return;
      }
      const json = await res.json() as { data: { id: string } };
      router.push(`/flows/${json.data.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/flows" className="text-sm text-gray-500 hover:text-gray-700">← Flows</Link>
        <h1 className="text-2xl font-semibold text-gray-900">New Flow</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <Input
          label="Flow Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Welcome Message"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Trigger</label>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {TRIGGER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Link href="/flows" className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Cancel
          </Link>
          <Button onClick={() => { void handleCreate(); }} disabled={!name.trim() || saving}>
            {saving ? "Creating…" : "Create & Open Editor"}
          </Button>
        </div>
      </div>
    </div>
  );
}
