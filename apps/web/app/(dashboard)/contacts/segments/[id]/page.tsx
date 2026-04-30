"use client";

import { JSX, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { SegmentBuilder, type FilterRule } from "@/components/segments/SegmentBuilder";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Contact { id: string; name: string | null; phoneNumber: string; lifecycleStage: string; }
interface Segment { id: string; name: string; filters: FilterRule[]; }

const stageVariant: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = {
  customer: "green", prospect: "blue", lead: "yellow", churned: "red", loyal: "green",
};

export default function SegmentDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [segment, setSegment] = useState<Segment | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const [sRes, cRes] = await Promise.all([
        fetch(`${API_URL}/v1/segments/${id}`, { headers: { Authorization: `Bearer ${token ?? ""}` } }),
        fetch(`${API_URL}/v1/segments/${id}/contacts`, { headers: { Authorization: `Bearer ${token ?? ""}` } }),
      ]);
      if (sRes.ok) {
        const s = (await sRes.json() as { data: Segment }).data;
        setSegment(s);
        setFilters(s.filters as FilterRule[]);
      }
      if (cRes.ok) setContacts((await cRes.json() as { data: Contact[] }).data);
      setLoading(false);
    })();
  }, [id, getToken]);

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filters }),
      });
      if (res.ok) setSegment((await res.json() as { data: Segment }).data);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="animate-pulse h-40 bg-gray-100 rounded-xl" />;
  if (!segment) return <p className="text-gray-500">Segment not found.</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/contacts/segments" className="text-sm text-gray-500 hover:text-gray-700">← Segments</Link>
        <h1 className="text-2xl font-semibold text-gray-900">{segment.name}</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-medium text-gray-800">Filters</h2>
        <SegmentBuilder initial={filters} onChange={setFilters} />
        <Button onClick={() => { void handleSave(); }} disabled={saving}>
          {saving ? "Saving…" : "Save Filters"}
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-medium text-gray-800">Matching Contacts ({contacts.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Phone</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Stage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {contacts.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No contacts match this segment.</td></tr>
            ) : contacts.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/contacts/${c.id}`} className="font-medium text-gray-900 hover:text-brand-600">
                    {c.name ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-600">{c.phoneNumber}</td>
                <td className="px-4 py-2">
                  <Badge variant={stageVariant[c.lifecycleStage] ?? "gray"}>{c.lifecycleStage}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
