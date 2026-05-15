"use client";

import { JSX, useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toast, useToast } from "@/components/ui/Toast";
import { LabelBadge, type LabelItem } from "@/components/ui/LabelBadge";
import { AddContactModal, type Contact } from "./AddContactModal";

const stageVariant: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = {
  customer: "green",
  prospect: "blue",
  lead:     "yellow",
  churned:  "red",
  loyal:    "green",
};

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface ContactWithLabels extends Contact {
  labels?: { label: LabelItem }[];
}

interface Props {
  initialContacts: ContactWithLabels[];
}

export function ContactsClient({ initialContacts }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [contacts, setContacts] = useState<ContactWithLabels[]>(initialContacts);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [selectedLabelId, setSelectedLabelId] = useState<string>("");
  const { toast, toastState, setToastOpen } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load available labels for the filter dropdown
  useEffect(() => {
    void (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/v1/labels`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setLabels((await res.json() as { data: LabelItem[] }).data);
    })();
  }, [getToken]);

  const fetchByLabel = useCallback(async (labelId: string) => {
    const token = await getToken();
    if (!token) return;
    setSearching(true);
    try {
      const url = labelId
        ? `${API_URL}/v1/contacts?labelId=${encodeURIComponent(labelId)}`
        : `${API_URL}/v1/contacts`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const json = await res.json() as { data: ContactWithLabels[] };
        setContacts(json.data);
      }
    } finally {
      setSearching(false);
    }
  }, [getToken]);

  const search = useCallback(async (q: string) => {
    const token = await getToken();
    if (!token) return;
    setSearching(true);
    try {
      const res = await fetch(
        `${API_URL}/v1/contacts/search?q=${encodeURIComponent(q)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const json = await res.json() as { data: ContactWithLabels[] };
        setContacts(json.data);
      }
    } finally {
      setSearching(false);
    }
  }, [getToken]);

  // Debounced search — clears label filter when typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      if (!selectedLabelId) setContacts(initialContacts);
      else void fetchByLabel(selectedLabelId);
      return;
    }
    setSelectedLabelId("");
    debounceRef.current = setTimeout(() => { void search(query); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search, initialContacts, selectedLabelId, fetchByLabel]);

  // Re-fetch when label filter changes
  useEffect(() => {
    if (query.trim()) return;
    void fetchByLabel(selectedLabelId);
  }, [selectedLabelId, fetchByLabel, query]);

  function handleCreated(contact: Contact) {
    setContacts((prev) => [contact, ...prev]);
    setShowModal(false);
    toast("Contact created", { variant: "success" });
  }

  const activeLabel = labels.find((l) => l.id === selectedLabelId);

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 flex-1">Contacts</h1>

          {/* Label filter */}
          <div className="relative">
            <select
              value={selectedLabelId}
              onChange={(e) => { setSelectedLabelId(e.target.value); setQuery(""); }}
              className="h-9 pl-3 pr-8 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none cursor-pointer"
            >
              <option value="">All labels</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2.5 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <div className="w-56">
            <Input
              placeholder="Search contacts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Link href="/contacts/import">
            <Button variant="secondary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import CSV
            </Button>
          </Link>
          <Button onClick={() => setShowModal(true)}>Add Contact</Button>
        </div>

        {/* Active filter pill */}
        {activeLabel && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Filtered by:</span>
            <LabelBadge label={activeLabel} onRemove={() => setSelectedLabelId("")} />
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Labels</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {searching ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Searching…
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    {query
                      ? "No contacts match your search."
                      : activeLabel
                      ? `No contacts with label "${activeLabel.title}".`
                      : "No contacts yet. Add your first contact."}
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer group">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link href={`/contacts/${c.id}`} className="block group-hover:text-brand-600 transition-colors">
                        {c.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <Link href={`/contacts/${c.id}`} className="block">{c.phoneNumber}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <Link href={`/contacts/${c.id}`} className="block">{c.email ?? "—"}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${c.id}`} className="block">
                        <Badge variant={stageVariant[c.lifecycleStage] ?? "gray"}>
                          {c.lifecycleStage}
                        </Badge>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.labels?.map(({ label }) => (
                          <LabelBadge key={label.id} label={label} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddContactModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
      />

      <Toast
        title={toastState.title}
        variant={toastState.variant}
        open={toastState.open}
        onOpenChange={setToastOpen}
      />
    </>
  );
}
