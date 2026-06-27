"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SegmentBuilderV2 } from "@/components/segments/SegmentBuilderV2";
import type { FilterRule, MatchMode } from "@/components/segments/types";
import { Button } from "@/components/ui/Button";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface ContactPreview {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  leadStatus: { name: string; color: string } | null;
}

export default function NewSegmentPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [match, setMatch] = useState<MatchMode>("all");
  const [whatsappOptedOnly, setWhatsappOptedOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewContacts, setPreviewContacts] = useState<ContactPreview[]>([]);

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

  async function handlePreview(): Promise<void> {
    setPreviewing(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments/preview`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filters, match, whatsappOptedOnly }),
      });
      if (res.ok) {
        const result = (await res.json() as { data: { count: number; contacts: ContactPreview[] } }).data;
        setPreviewCount(result.count);
        setPreviewContacts(result.contacts);
      }
    } finally {
      setPreviewing(false);
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
          <Button variant="secondary" onClick={() => { void handlePreview(); }} disabled={previewing || filters.length === 0}>
            {previewing ? "Previewing…" : "Preview"}
          </Button>
          <Button onClick={() => { void handleSave(); }} disabled={!name.trim() || saving}>
            {saving ? "Saving…" : "Save Segment"}
          </Button>
        </div>
      </div>

      {previewCount !== null && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-800">
              Matching Contacts ({previewCount})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Phone</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {previewContacts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                    No contacts match these filters.
                  </td>
                </tr>
              ) : previewContacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/contacts/${c.id}`} className="font-medium text-gray-900 hover:text-brand-600">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{c.phoneNumber}</td>
                  <td className="px-4 py-2">
                    {c.leadStatus ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.leadStatus.color }} />
                        {c.leadStatus.name}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
