"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SegmentBuilderV2 } from "@/components/segments/SegmentBuilderV2";
import type { FilterRule, MatchMode } from "@/components/segments/types";
import { Button } from "@/components/ui/Button";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export default function NewSegmentPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [match, setMatch] = useState<MatchMode>("all");
  const [whatsappOptedOnly, setWhatsappOptedOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave(): Promise<void> {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), filters, match, whatsappOptedOnly }),
      });
      if (!res.ok) return;
      const created = (await res.json() as { data: { id: string } }).data;
      router.push(`/contacts/segments/${created.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/contacts/segments" className="text-sm text-gray-500 hover:text-gray-700">← Segments</Link>
        <h1 className="text-2xl font-semibold text-gray-900">New Segment</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <input
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Segment name (e.g. All VIP Contacts)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
          />
        </div>

        <SegmentBuilderV2
          initial={filters}
          match={match}
          whatsappOptedOnly={whatsappOptedOnly}
          onChange={setFilters}
          onMatchChange={setMatch}
          onWhatsappOptedOnlyChange={setWhatsappOptedOnly}
        />

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={() => { void handleSave(); }} disabled={!name.trim() || saving}>
            {saving ? "Saving…" : "Save Segment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
