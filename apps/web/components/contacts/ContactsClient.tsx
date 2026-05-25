"use client";

import { JSX, useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toast, useToast } from "@/components/ui/Toast";
import { LabelBadge, type LabelItem } from "@/components/ui/LabelBadge";
import { AddContactModal, type Contact, type EditableContact } from "./AddContactModal";

const stageVariant: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = {
  customer: "green",
  prospect: "blue",
  lead:     "yellow",
  churned:  "red",
  loyal:    "green",
};

const LIFECYCLE_STAGES = ["lead", "prospect", "customer", "loyal", "churned"];

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
  const [editContact, setEditContact] = useState<EditableContact | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [selectedLabelId, setSelectedLabelId] = useState<string>("");
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [exporting, setExporting] = useState(false);
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
      const params = new URLSearchParams();
      if (labelId) params.set("labelId", labelId);
      if (selectedStage) params.set("lifecycleStage", selectedStage);
      if (dateFrom) params.set("createdFrom", dateFrom);
      if (dateTo) params.set("createdTo", dateTo);
      const url = `${API_URL}/v1/contacts${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const json = await res.json() as { data: ContactWithLabels[] };
        setContacts(json.data);
      }
    } finally {
      setSearching(false);
    }
  }, [getToken, selectedStage, dateFrom, dateTo]);

  const handleExportCsv = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/v1/contacts/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { toast("Export failed", { variant: "error" }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contacts.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [getToken, toast]);

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
      if (!selectedLabelId && !selectedStage && !dateFrom && !dateTo) setContacts(initialContacts);
      else void fetchByLabel(selectedLabelId);
      return;
    }
    setSelectedLabelId("");
    debounceRef.current = setTimeout(() => { void search(query); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search, initialContacts, selectedLabelId, selectedStage, dateFrom, dateTo, fetchByLabel]);

  // Re-fetch when any filter changes
  useEffect(() => {
    if (query.trim()) return;
    void fetchByLabel(selectedLabelId);
  }, [selectedLabelId, selectedStage, dateFrom, dateTo, fetchByLabel, query]);

  function handleCreated(contact: Contact) {
    setContacts((prev) => [contact as ContactWithLabels, ...prev]);
    setShowModal(false);
    setEditContact(undefined);
    toast("Contact created", { variant: "success" });
    void fetchByLabel(selectedLabelId);
  }

  async function handleEditClick(e: React.MouseEvent, contactId: string) {
    e.preventDefault();
    e.stopPropagation();
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/v1/contacts/${contactId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const json = await res.json() as { data: EditableContact & { customFields?: Record<string, string> | null } };
    setEditContact(json.data);
    setShowModal(true);
  }

  function handleUpdated(contact: Contact) {
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, ...contact } : c)));
    setShowModal(false);
    setEditContact(undefined);
    toast("Contact updated", { variant: "success" });
  }

  const activeFiltersCount = [selectedLabelId, selectedStage, dateFrom, dateTo].filter(Boolean).length;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 flex-1">Contacts</h1>

          <div className="w-56">
            <Input
              placeholder="Search contacts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Advanced filter toggle */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 h-9 px-3 text-sm border rounded-lg transition-colors ${showFilters || activeFiltersCount > 0 ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Filters
            {activeFiltersCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-xs bg-brand-600 text-white rounded-full">{activeFiltersCount}</span>
            )}
          </button>

          <Link href="/contacts/import">
            <Button variant="secondary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import
            </Button>
          </Link>

          <Button variant="secondary" onClick={() => void handleExportCsv()} disabled={exporting}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>

          <Button onClick={() => setShowModal(true)}>Add Contact</Button>
        </div>

        {/* Advanced filter panel */}
        {showFilters && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Lifecycle Stage</label>
              <select
                value={selectedStage}
                onChange={(e) => { setSelectedStage(e.target.value); setQuery(""); }}
                className="h-9 pl-3 pr-8 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none"
              >
                <option value="">All stages</option>
                {LIFECYCLE_STAGES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Label</label>
              <select
                value={selectedLabelId}
                onChange={(e) => { setSelectedLabelId(e.target.value); setQuery(""); }}
                className="h-9 pl-3 pr-8 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none"
              >
                <option value="">All labels</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Created from</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Created to</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {activeFiltersCount > 0 && (
              <button
                onClick={() => { setSelectedLabelId(""); setSelectedStage(""); setDateFrom(""); setDateTo(""); }}
                className="h-9 px-3 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Active filter pills */}
        {!showFilters && activeFiltersCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
            <span>Filtered by:</span>
            {selectedStage && <span className="px-2 py-0.5 bg-gray-100 rounded-full capitalize">{selectedStage}</span>}
            {selectedLabelId && labels.find((l) => l.id === selectedLabelId) && (
              <LabelBadge label={labels.find((l) => l.id === selectedLabelId)!} onRemove={() => setSelectedLabelId("")} />
            )}
            {dateFrom && <span className="px-2 py-0.5 bg-gray-100 rounded-full">From {dateFrom}</span>}
            {dateTo && <span className="px-2 py-0.5 bg-gray-100 rounded-full">To {dateTo}</span>}
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
                <th className="px-4 py-3" />
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
                      : activeFiltersCount > 0
                      ? "No contacts match the active filters."
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
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { void handleEditClick(e, c.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-brand-600 p-1 rounded"
                        title="Edit contact"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
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
        onClose={() => { setShowModal(false); setEditContact(undefined); }}
        onCreated={handleCreated}
        editContact={editContact}
        onUpdated={handleUpdated}
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
