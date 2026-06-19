"use client";

import { JSX, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { SegmentBuilder, type FilterRule, type MatchMode } from "@/components/segments/SegmentBuilder";
import { Button } from "@/components/ui/Button";
const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface ContactPreview {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  leadStatus: { name: string; color: string } | null;
}

interface Segment {
  id: string;
  name: string;
  filters: FilterRule[];
  match: MatchMode;
}

export default function SegmentDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [segment, setSegment] = useState<Segment | null>(null);
  const [loadedFilters, setLoadedFilters] = useState<FilterRule[]>([]);
  const [loadedMatch, setLoadedMatch] = useState<MatchMode>("all");
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [match, setMatch] = useState<MatchMode>("all");
  const [contacts, setContacts] = useState<ContactPreview[]>([]);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments/${id}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (cancelled) return;
      if (res.ok) {
        const s = (await res.json() as { data: Segment }).data;
        setSegment(s);
        setLoadedFilters(s.filters);
        setLoadedMatch(s.match ?? "all");
        setFilters(s.filters);
        setMatch(s.match ?? "all");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, getToken]);

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getToken();
      const patchRes = await fetch(`${API_URL}/v1/segments/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filters, match }),
      });
      if (!patchRes.ok) return;
      setSegment((await patchRes.json() as { data: Segment }).data);
      // Evaluate to refresh matching contacts
      const evalRes = await fetch(`${API_URL}/v1/segments/${id}/evaluate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (evalRes.ok) {
        const result = (await evalRes.json() as { data: { count: number; contacts: ContactPreview[] } }).data;
        setMatchCount(result.count);
        setContacts(result.contacts);
      }
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
        <SegmentBuilder
          initial={loadedFilters}
          match={loadedMatch}
          onChange={setFilters}
          onMatchChange={setMatch}
        />
        <div className="flex items-center gap-3">
          <Button onClick={() => { void handleSave(); }} disabled={saving}>
            {saving ? "Saving…" : "Save Filters"}
          </Button>
          {matchCount !== null && (
            <span className="text-sm text-green-600 font-medium">
              {matchCount} contact{matchCount !== 1 ? "s" : ""} match this segment
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-medium text-gray-800">
            Matching Contacts {matchCount !== null ? `(${matchCount})` : ""}
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
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  {matchCount === null ? "Save filters to see matching contacts." : "No contacts match this segment."}
                </td>
              </tr>
            ) : contacts.map((c) => (
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
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
