"use client";

import { JSX, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
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

interface Segment {
  id: string;
  name: string;
  filters: FilterRule[];
  match: MatchMode;
  whatsappOptedOnly: boolean;
}

export default function SegmentDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [segment, setSegment] = useState<Segment | null>(null);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [match, setMatch] = useState<MatchMode>("all");
  const [whatsappOptedOnly, setWhatsappOptedOnly] = useState(false);
  const [contacts, setContacts] = useState<ContactPreview[]>([]);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
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
        setFilters(s.filters);
        setMatch(s.match ?? "all");
        setWhatsappOptedOnly(s.whatsappOptedOnly ?? false);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, getToken]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      const token = await getToken();
      const patchRes = await fetch(`${API_URL}/v1/segments/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filters, match, whatsappOptedOnly }),
      });
      if (!patchRes.ok) return;
      setSegment((await patchRes.json() as { data: Segment }).data);
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
        setMatchCount(result.count);
        setContacts(result.contacts);
      }
    } finally {
      setPreviewing(false);
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
        <SegmentBuilderV2
          initial={filters}
          match={match}
          whatsappOptedOnly={whatsappOptedOnly}
          onChange={setFilters}
          onMatchChange={setMatch}
          onWhatsappOptedOnlyChange={setWhatsappOptedOnly}
        />
        <div className="flex items-center gap-3 pt-2">
          <Button variant="secondary" onClick={() => { void handlePreview(); }} disabled={previewing || saving}>
            {previewing ? "Previewing…" : "Preview"}
          </Button>
          <Button onClick={() => { void handleSave(); }} disabled={saving || previewing}>
            {saving ? "Saving…" : "Save Segment"}
          </Button>
          {matchCount !== null && (
            <span className="text-sm text-green-700 font-medium">
              {matchCount} contact{matchCount !== 1 ? "s" : ""} match this segment
            </span>
          )}
        </div>
      </div>

      {/* Matching contacts table */}
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
                  {matchCount === null ? "Preview or save to see matching contacts." : "No contacts match this segment."}
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
                  ) : <span className="text-gray-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
