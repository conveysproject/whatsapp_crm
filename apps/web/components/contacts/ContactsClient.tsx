"use client";

import { JSX, useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Toast, useToast } from "@/components/ui/Toast";
import { AddContactModal, type Contact, type EditableContact } from "./AddContactModal";
import { EditContactDrawer } from "./EditContactDrawer";
import { SendTemplateModal } from "./SendTemplateModal";
import { ContactChatDrawer } from "./ContactChatDrawer";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface ContactWithLabels extends Contact {
  labels?: { label: { id: string; title: string; color: string } }[];
}

interface Props {
  initialContacts: ContactWithLabels[];
}

type SortField = "firstName" | "lastName" | "phoneNumber" | "languageCode" | "createdAt" | "email" | "whatsappOptOut";
type SortDir = "asc" | "desc";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  } catch {
    return iso;
  }
}

export function ContactsClient({ initialContacts }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [contacts, setContacts] = useState<ContactWithLabels[]>(initialContacts);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // add/edit
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [editContact, setEditContact] = useState<EditableContact | undefined>(undefined);
  const [loadingEditContact, setLoadingEditContact] = useState(false);

  // selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkRef = useRef<HTMLDivElement>(null);

  // expand row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // pagination + sort
  const [perPage, setPerPage] = useState(100);
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // send template
  const [templateContactId, setTemplateContactId] = useState<string | null>(null);

  // chat drawer
  const [chatContactId, setChatContactId] = useState<string | null>(null);
  const [chatContactName, setChatContactName] = useState<string>("");

  // delete all confirm
  const [deletingAll, setDeletingAll] = useState(false);

  const { toast, toastState, setToastOpen } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // close bulk dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bulkRef.current && !bulkRef.current.contains(e.target as Node)) setBulkOpen(false);
    }
    if (bulkOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [bulkOpen]);

  const fetchContacts = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/v1/contacts`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setContacts((await res.json() as { data: ContactWithLabels[] }).data);
    } finally {
      setSearching(false);
    }
  }, [getToken]);

  const search = useCallback(async (q: string) => {
    const token = await getToken();
    if (!token) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/v1/contacts/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setContacts((await res.json() as { data: ContactWithLabels[] }).data);
    } finally {
      setSearching(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setContacts(initialContacts); return; }
    debounceRef.current = setTimeout(() => { void search(query); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search, initialContacts]);

  // sort
  const sorted = [...contacts].sort((a, b) => {
    let av: string = "";
    let bv: string = "";
    if (sortField === "firstName") { av = a.firstName ?? ""; bv = b.firstName ?? ""; }
    else if (sortField === "lastName") { av = a.lastName ?? ""; bv = b.lastName ?? ""; }
    else if (sortField === "phoneNumber") { av = a.phoneNumber; bv = b.phoneNumber; }
    else if (sortField === "languageCode") { av = a.languageCode ?? ""; bv = b.languageCode ?? ""; }
    else if (sortField === "createdAt") { av = a.createdAt ?? ""; bv = b.createdAt ?? ""; }
    else if (sortField === "email") { av = a.email ?? ""; bv = b.email ?? ""; }
    else if (sortField === "whatsappOptOut") { av = String(a.whatsappOptOut); bv = String(b.whatsappOptOut); }
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  // paginate
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * perPage;
  const pageEnd = Math.min(pageStart + perPage, total);
  const visible = sorted.slice(pageStart, pageEnd);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
    setPage(1);
  }

  function SortIcon({ field }: { field: SortField }): JSX.Element {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-brand-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // selection
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selectedIds.has(c.id));
  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => { const n = new Set(prev); visible.forEach((c) => n.delete(c.id)); return n; });
    } else {
      setSelectedIds((prev) => { const n = new Set(prev); visible.forEach((c) => n.add(c.id)); return n; });
    }
  }
  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function handleCreated(contact: Contact) {
    setContacts((prev) => [contact as ContactWithLabels, ...prev]);
    setShowAddDrawer(false);
    toast("Contact created", { variant: "success" });
  }

  async function handleEditClick(contactId: string) {
    setEditContact(undefined);
    setShowEditDrawer(true);
    setLoadingEditContact(true);
    const token = await getToken();
    if (!token) { setLoadingEditContact(false); return; }
    const res = await fetch(`${API_URL}/v1/contacts/${contactId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { setLoadingEditContact(false); return; }
    const json = await res.json() as { data: EditableContact };
    setEditContact(json.data);
    setLoadingEditContact(false);
  }

  function handleUpdated(contact: Contact) {
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, ...contact } : c)));
    setShowEditDrawer(false);
    setEditContact(undefined);
    toast("Contact updated", { variant: "success" });
  }

  async function handleDeleteContact(contactId: string) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/v1/contacts/${contactId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok || res.status === 204) {
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(contactId); return n; });
      if (expandedId === contactId) setExpandedId(null);
      toast("Contact deleted", { variant: "success" });
    } else {
      toast("Failed to delete contact", { variant: "error" });
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/v1/contacts/bulk`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ids }),
    });
    if (res.ok) {
      setContacts((prev) => prev.filter((c) => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
      setBulkOpen(false);
      toast(`${ids.length} contact${ids.length > 1 ? "s" : ""} deleted`, { variant: "success" });
    } else {
      toast("Bulk delete failed", { variant: "error" });
    }
  }

  async function handleDeleteAll() {
    if (!confirm("Delete ALL contacts? This cannot be undone.")) return;
    setDeletingAll(true);
    const token = await getToken();
    if (!token) { setDeletingAll(false); return; }
    const allIds = contacts.map((c) => c.id);
    const res = await fetch(`${API_URL}/v1/contacts/bulk`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: allIds }),
    });
    setDeletingAll(false);
    if (res.ok) {
      setContacts([]);
      setSelectedIds(new Set());
      toast("All contacts deleted", { variant: "success" });
    } else {
      toast("Failed to delete all contacts", { variant: "error" });
    }
  }

  async function handleExport() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/v1/contacts/export`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { toast("Export failed", { variant: "error" }); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contacts.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const pageNumbers: number[] = [];
  const start = Math.max(1, safePage - 2);
  const end = Math.min(totalPages, safePage + 2);
  for (let i = start; i <= end; i++) pageNumbers.push(i);

  return (
    <>
      <div className="space-y-3">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-brand-600">Contacts</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddDrawer(true)}
              className="flex items-center gap-1.5 h-9 px-4 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              Create New Contact
            </button>
            <button
              onClick={() => void handleExport()}
              className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download Contacts
            </button>
            <Link
              href="/contacts/import"
              className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Upload Contacts
            </Link>
          </div>
        </div>

        {/* ── Action bar ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="h-9 px-3 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              Select All
            </button>

            <div ref={bulkRef} className="relative">
              <button
                onClick={() => setBulkOpen((v) => !v)}
                className="flex items-center gap-1 h-9 px-3 text-sm font-medium border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Bulk Actions
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {bulkOpen && (
                <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                  <button
                    onClick={() => void handleBulkDelete()}
                    disabled={selectedIds.size === 0}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Delete Selected ({selectedIds.size})
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => void handleDeleteAll()}
              disabled={deletingAll || contacts.length === 0}
              className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Delete All Contact
            </button>
          </div>

          <button className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
            Advanced Contacts Filters
          </button>
        </div>

        {/* ── Table card ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* table controls */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              Show
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="h-8 pl-2 pr-6 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none"
              >
                {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              entries
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              Search:
              <input
                className="h-8 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder=""
              />
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 w-8" />
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="rounded border-gray-300 accent-brand-600" />
                </th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 uppercase text-xs tracking-wide cursor-pointer select-none" onClick={() => toggleSort("firstName")}>
                  First Name<SortIcon field="firstName" />
                </th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 uppercase text-xs tracking-wide cursor-pointer select-none" onClick={() => toggleSort("lastName")}>
                  Last Name<SortIcon field="lastName" />
                </th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 uppercase text-xs tracking-wide cursor-pointer select-none" onClick={() => toggleSort("phoneNumber")}>
                  Mobile Number<SortIcon field="phoneNumber" />
                </th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 uppercase text-xs tracking-wide cursor-pointer select-none" onClick={() => toggleSort("languageCode")}>
                  Language Code<SortIcon field="languageCode" />
                </th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 uppercase text-xs tracking-wide cursor-pointer select-none" onClick={() => toggleSort("createdAt")}>
                  Created On<SortIcon field="createdAt" />
                </th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 uppercase text-xs tracking-wide">Country</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 uppercase text-xs tracking-wide cursor-pointer select-none" onClick={() => toggleSort("email")}>
                  Email<SortIcon field="email" />
                </th>
                <th className="px-3 py-3 text-left font-semibold text-gray-600 uppercase text-xs tracking-wide cursor-pointer select-none" onClick={() => toggleSort("whatsappOptOut")}>
                  Marketing<SortIcon field="whatsappOptOut" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {searching ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Searching…</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">{query ? "No contacts match your search." : "No contacts yet."}</td></tr>
              ) : (
                visible.map((c) => {
                  const isExpanded = expandedId === c.id;
                  const isSelected = selectedIds.has(c.id);
                  const groups = c.groupContacts?.map((gc) => gc.contactGroup.title) ?? [];
                  return [
                    <tr
                      key={c.id}
                      className={`transition-colors ${isSelected ? "bg-brand-50" : "hover:bg-gray-50"}`}
                    >
                      {/* expand toggle */}
                      <td className="px-3 py-3 w-8">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : c.id)}
                          className="w-6 h-6 rounded border border-gray-300 bg-white flex items-center justify-center text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors text-sm font-bold"
                        >
                          {isExpanded ? "−" : "+"}
                        </button>
                      </td>
                      {/* checkbox */}
                      <td className="px-3 py-3 w-8">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(c.id)} className="rounded border-gray-300 accent-brand-600" />
                      </td>
                      <td className="px-3 py-3 text-gray-900">{c.firstName ?? "—"}</td>
                      <td className="px-3 py-3 text-gray-700">{c.lastName ?? "—"}</td>
                      <td className="px-3 py-3 text-gray-700 font-mono text-xs">{c.phoneNumber}</td>
                      <td className="px-3 py-3 text-gray-700">{c.languageCode ?? "—"}</td>
                      <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">{c.createdAt ? formatDate(c.createdAt) : "—"}</td>
                      <td className="px-3 py-3 text-gray-700">{c.country?.name ?? "—"}</td>
                      <td className="px-3 py-3 text-gray-700">{c.email ?? "—"}</td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.whatsappOptOut ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                          {c.whatsappOptOut ? "Opted Out" : "Subscribed"}
                        </span>
                      </td>
                    </tr>,

                    isExpanded && (
                      <tr key={`${c.id}-expanded`} className="bg-gray-50 border-b border-gray-200">
                        <td colSpan={10} className="px-6 py-3">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-semibold text-gray-700">Groups:</span>
                              <span className="text-gray-600">{groups.length > 0 ? groups.join(", ") : "—"}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-gray-700">Action:</span>
                              <Link
                                href={`/contacts/${c.id}`}
                                className="flex items-center gap-1 h-7 px-3 text-xs font-medium bg-gray-800 text-white rounded hover:bg-gray-900 transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Details
                              </Link>
                              <button
                                onClick={() => void handleEditClick(c.id)}
                                className="flex items-center gap-1 h-7 px-3 text-xs font-medium bg-gray-800 text-white rounded hover:bg-gray-900 transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                Edit
                              </button>
                              <button
                                onClick={() => setTemplateContactId(c.id)}
                                className="flex items-center gap-1 h-7 px-3 text-xs font-medium bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.025.507 3.934 1.395 5.61L0 24l6.545-1.378A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.893 0-3.67-.497-5.209-1.367l-.374-.222-3.884.818.821-3.801-.243-.389A9.937 9.937 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                                Send Template Message
                              </button>
                              <button
                                onClick={() => { setChatContactId(c.id); setChatContactName([c.firstName, c.lastName].filter(Boolean).join(" ") || c.phoneNumber); }}
                                className="flex items-center gap-1 h-7 px-3 text-xs font-medium bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                Chat
                              </button>
                              <button
                                onClick={() => { if (confirm("Delete this contact?")) void handleDeleteContact(c.id); }}
                                className="flex items-center gap-1 h-7 px-3 text-xs font-medium bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Delete
                              </button>
                              <button
                                className="flex items-center gap-1 h-7 px-3 text-xs font-medium bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                Assign
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })
              )}
            </tbody>
          </table>

          {/* ── Footer ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
            <span>
              {total === 0
                ? "No entries"
                : `Showing ${pageStart + 1} to ${pageEnd} of ${total} entries`}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="h-8 px-3 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`h-8 w-8 text-sm rounded transition-colors ${n === safePage ? "bg-brand-600 text-white border border-brand-600" : "border border-gray-300 hover:bg-gray-50"}`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="h-8 px-3 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Drawers & Modals ────────────────────────────────────────── */}
      <AddContactModal
        open={showAddDrawer}
        onClose={() => setShowAddDrawer(false)}
        onCreated={handleCreated}
      />

      <EditContactDrawer
        key={editContact?.id}
        open={showEditDrawer}
        loading={loadingEditContact}
        contact={editContact}
        onClose={() => { setShowEditDrawer(false); setEditContact(undefined); }}
        onUpdated={handleUpdated}
      />

      {templateContactId && (
        <SendTemplateModal
          contactId={templateContactId}
          onClose={() => setTemplateContactId(null)}
          onSent={() => { setTemplateContactId(null); toast("Template sent", { variant: "success" }); }}
        />
      )}

      {chatContactId && (
        <ContactChatDrawer
          contactId={chatContactId}
          contactName={chatContactName}
          onClose={() => setChatContactId(null)}
        />
      )}

      <Toast
        title={toastState.title}
        variant={toastState.variant}
        open={toastState.open}
        onOpenChange={setToastOpen}
      />
    </>
  );
}
