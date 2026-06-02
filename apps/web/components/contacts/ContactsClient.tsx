"use client";

import { JSX, useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Toast, useToast } from "@/components/ui/Toast";
import { AddContactModal, type Contact, type EditableContact } from "./AddContactModal";
import { EditContactDrawer } from "./EditContactDrawer";
import { SendTemplateModal } from "./SendTemplateModal";
import { ContactChatDrawer } from "./ContactChatDrawer";
import { ExportModal } from "./ExportModal";
import { ContactTrustBadge } from "@/components/trust-score/ContactTrustBadge";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface ContactWithLabels extends Contact {
  tags?: string[];
}

interface Props {
  initialContacts: ContactWithLabels[];
}

type SortField = "firstName" | "lastName" | "phoneNumber" | "languageCode" | "createdAt" | "email" | "whatsappOptOut";
type SortDir = "asc" | "desc";

const AVATAR_PALETTE = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
];

function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]!;
}

function initials(c: ContactWithLabels): string {
  const fn = c.firstName?.trim()[0] ?? "";
  const ln = c.lastName?.trim()[0] ?? "";
  return (fn + ln).toUpperCase() || c.phoneNumber.slice(-2);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
}

export function ContactsClient({ initialContacts }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [contacts, setContacts] = useState<ContactWithLabels[]>(initialContacts);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [editContact, setEditContact] = useState<EditableContact | undefined>(undefined);
  const [loadingEditContact, setLoadingEditContact] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [templateContactId, setTemplateContactId] = useState<string | null>(null);
  const [chatContactId, setChatContactId] = useState<string | null>(null);
  const [chatContactName, setChatContactName] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const { toast, toastState, setToastOpen } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    const token = await getToken();
    if (!token) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/v1/contacts/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setContacts((await res.json() as { data: ContactWithLabels[] }).data);
    } finally { setSearching(false); }
  }, [getToken]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setContacts(initialContacts); return; }
    debounceRef.current = setTimeout(() => { void search(query); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search, initialContacts]);

  const sorted = [...contacts].sort((a, b) => {
    const get = (c: ContactWithLabels) => {
      if (sortField === "firstName") return c.firstName ?? "";
      if (sortField === "lastName") return c.lastName ?? "";
      if (sortField === "phoneNumber") return c.phoneNumber;
      if (sortField === "languageCode") return c.languageCode ?? "";
      if (sortField === "createdAt") return c.createdAt ?? "";
      if (sortField === "email") return c.email ?? "";
      return String(c.whatsappOptOut);
    };
    return sortDir === "asc" ? get(a).localeCompare(get(b)) : get(b).localeCompare(get(a));
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * perPage;
  const pageEnd = Math.min(pageStart + perPage, total);
  const visible = sorted.slice(pageStart, pageEnd);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
    setPage(1);
  }

  const allVisibleSelected = visible.length > 0 && visible.every((c) => selectedIds.has(c.id));
  function toggleSelectAll() {
    if (allVisibleSelected) setSelectedIds((p) => { const n = new Set(p); visible.forEach((c) => n.delete(c.id)); return n; });
    else setSelectedIds((p) => { const n = new Set(p); visible.forEach((c) => n.add(c.id)); return n; });
  }
  function toggleSelect(id: string) {
    setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
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
    setEditContact((await res.json() as { data: EditableContact }).data);
    setLoadingEditContact(false);
  }

  function handleUpdated(contact: Contact) {
    setContacts((prev) => prev.map((c) => c.id === contact.id ? { ...c, ...contact } : c));
    setShowEditDrawer(false);
    setEditContact(undefined);
    toast("Contact updated", { variant: "success" });
  }

  async function handleDelete(contactId: string) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/v1/contacts/${contactId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok || res.status === 204) {
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      setSelectedIds((p) => { const n = new Set(p); n.delete(contactId); return n; });
      if (expandedId === contactId) setExpandedId(null);
      toast("Contact deleted", { variant: "success" });
    } else toast("Failed to delete", { variant: "error" });
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
      toast(`${ids.length} contact${ids.length > 1 ? "s" : ""} deleted`, { variant: "success" });
    } else toast("Bulk delete failed", { variant: "error" });
  }

  async function handleDeleteAll() {
    if (!confirm("Delete ALL contacts? This cannot be undone.")) return;
    setDeletingAll(true);
    const token = await getToken();
    if (!token) { setDeletingAll(false); return; }
    const res = await fetch(`${API_URL}/v1/contacts/bulk`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: contacts.map((c) => c.id) }),
    });
    setDeletingAll(false);
    if (res.ok) { setContacts([]); setSelectedIds(new Set()); toast("All contacts deleted", { variant: "success" }); }
    else toast("Failed", { variant: "error" });
  }


  function Th({ field, label }: { field: SortField; label: string }): JSX.Element {
    const active = sortField === field;
    return (
      <th
        onClick={() => toggleSort(field)}
        className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest cursor-pointer select-none whitespace-nowrap group"
      >
        <span className="flex items-center gap-1">
          {label}
          <span className={`transition-colors ${active ? "text-brand-500" : "text-gray-200 group-hover:text-gray-400"}`}>
            {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </span>
      </th>
    );
  }

  const pageNums: number[] = [];
  for (let i = Math.max(1, safePage - 2); i <= Math.min(totalPages, safePage + 2); i++) pageNums.push(i);

  return (
    <>
      <div className="min-h-screen bg-gray-50/60">
        <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-5">

          {/* ── Header ────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Contacts</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {total.toLocaleString()} contact{total !== 1 ? "s" : ""}
                {query && <span className="text-brand-600"> · filtered</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
              >
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Export
              </button>
              <Link
                href="/contacts/import"
                className="flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
              >
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Import
              </Link>
              <button
                onClick={() => void handleDeleteAll()}
                disabled={deletingAll || contacts.length === 0}
                className="flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all shadow-sm disabled:opacity-40"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Delete All
              </button>
              <button
                onClick={() => setShowAddDrawer(true)}
                className="flex items-center gap-1.5 h-9 px-4 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New Contact
              </button>
            </div>
          </div>

          {/* ── Table card ────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

            {/* Controls */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                Show
                <select
                  value={perPage}
                  onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                  className="h-8 pl-2.5 pr-7 text-sm text-gray-700 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none cursor-pointer"
                >
                  {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                entries
              </div>

              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search contacts…"
                  className="h-9 pl-9 pr-4 w-64 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors placeholder-gray-400"
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-5 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 accent-brand-600 cursor-pointer"
                      />
                    </th>
                    <th className="px-2 py-3 w-10" />
                    <Th field="firstName" label="First Name" />
                    <Th field="lastName" label="Last Name" />
                    <Th field="phoneNumber" label="Mobile" />
                    <Th field="languageCode" label="Language" />
                    <Th field="createdAt" label="Created On" />
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Country</th>
                    <Th field="email" label="Email" />
                    <Th field="whatsappOptOut" label="Marketing" />
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">Trust</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-5 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </div>
                          <p className="text-gray-500 font-medium">{query ? "No contacts match your search" : "No contacts yet"}</p>
                          {!query && <button onClick={() => setShowAddDrawer(true)} className="text-sm text-brand-600 hover:text-brand-700 font-medium">Add your first contact →</button>}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visible.map((c) => {
                      const isExpanded = expandedId === c.id;
                      const isSelected = selectedIds.has(c.id);
                      const init = initials(c);
                      const color = avatarColor(c.firstName ?? c.phoneNumber);
                      const groups = c.groupContacts?.map((gc) => gc.contactGroup.title) ?? [];
                      const displayName = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phoneNumber;

                      return [
                        <tr
                          key={c.id}
                          className={`group border-b border-gray-50 transition-colors ${isSelected ? "bg-brand-50/60" : isExpanded ? "bg-gray-50/80" : "hover:bg-gray-50/60"}`}
                        >
                          <td className="px-5 py-3.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(c.id)}
                              className="rounded border-gray-300 accent-brand-600 cursor-pointer"
                            />
                          </td>
                          <td className="px-2 py-3.5">
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : c.id)}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${isExpanded ? "bg-brand-600 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                            >
                              {isExpanded ? "−" : "+"}
                            </button>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${color}`}>
                                {init}
                              </div>
                              <span className="font-medium text-gray-900">{c.firstName ?? "—"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-gray-700">{c.lastName ?? "—"}</td>
                          <td className="px-4 py-3.5 text-gray-600 font-mono text-xs tracking-wide">+{c.phoneNumber}</td>
                          <td className="px-4 py-3.5">
                            {c.languageCode
                              ? <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">{c.languageCode}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3.5 text-gray-500 text-xs whitespace-nowrap">{c.createdAt ? formatDate(c.createdAt) : "—"}</td>
                          <td className="px-4 py-3.5 text-gray-600">{c.country?.name ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3.5 text-gray-600">{c.email ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold ${c.whatsappOptOut ? "bg-red-50 text-red-600 ring-1 ring-red-200" : "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${c.whatsappOptOut ? "bg-red-400" : "bg-emerald-400"}`} />
                              {c.whatsappOptOut ? "Opted Out" : "Subscribed"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <ContactTrustBadge contactId={c.id} lazy />
                          </td>
                          <td className="px-4 py-3.5">
                            {c.tags && c.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {c.tags.slice(0, 3).map((tag) => (
                                  <span key={tag} className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">{tag}</span>
                                ))}
                                {c.tags.length > 3 && (
                                  <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-400">+{c.tags.length - 3}</span>
                                )}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>,

                        isExpanded && (
                          <tr key={`${c.id}-exp`} className="border-b border-gray-100 bg-gray-50/40">
                            <td colSpan={12} className="px-6 py-4">
                              <div className="flex items-start gap-8">
                                {/* Contact identity */}
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${color}`}>
                                    {init}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-gray-900 text-sm">{displayName}</p>
                                    <p className="text-xs text-gray-400 font-mono">+{c.phoneNumber}</p>
                                  </div>
                                </div>

                                {/* Groups */}
                                <div className="shrink-0">
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Groups</p>
                                  <div className="flex flex-wrap gap-1">
                                    {groups.length > 0
                                      ? groups.map((g) => (
                                          <span key={g} className="inline-flex items-center h-6 px-2.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 ring-1 ring-brand-200">{g}</span>
                                        ))
                                      : <span className="text-xs text-gray-400">No groups</span>}
                                  </div>
                                </div>

                                {/* Divider */}
                                <div className="w-px self-stretch bg-gray-200" />

                                {/* Actions */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Link
                                    href={`/contacts/${c.id}`}
                                    className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                                  >
                                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Details
                                  </Link>
                                  <button
                                    onClick={() => void handleEditClick(c.id)}
                                    className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                                  >
                                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => setTemplateContactId(c.id)}
                                    className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-white bg-teal-500 rounded-lg hover:bg-teal-600 transition-all shadow-sm"
                                  >
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>
                                    Send Template
                                  </button>
                                  <button
                                    onClick={() => { setChatContactId(c.id); setChatContactName(displayName); }}
                                    className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-white bg-teal-500 rounded-lg hover:bg-teal-600 transition-all shadow-sm"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                    Chat
                                  </button>
                                  <button
                                    onClick={() => { if (confirm(`Delete ${displayName}?`)) void handleDelete(c.id); }}
                                    className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all shadow-sm"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    Delete
                                  </button>
                                  <button className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all shadow-sm">
                                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
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
            </div>

            {/* ── Footer ─────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                {total === 0 ? "No entries" : `Showing ${pageStart + 1}–${pageEnd} of ${total.toLocaleString()}`}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  ‹
                </button>
                {pageNums[0]! > 1 && <span className="h-8 w-8 flex items-center justify-center text-xs text-gray-400">…</span>}
                {pageNums.map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`h-8 w-8 flex items-center justify-center rounded-lg text-sm font-medium transition-all ${n === safePage ? "bg-brand-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}
                  >
                    {n}
                  </button>
                ))}
                {pageNums[pageNums.length - 1]! < totalPages && <span className="h-8 w-8 flex items-center justify-center text-xs text-gray-400">…</span>}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Floating bulk action bar ───────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-gray-700">
          <span className="text-sm font-semibold">{selectedIds.size} selected</span>
          <div className="w-px h-4 bg-gray-600" />
          <button
            onClick={() => void handleBulkDelete()}
            className="flex items-center gap-1.5 text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Delete selected
          </button>
          <div className="w-px h-4 bg-gray-600" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <AddContactModal open={showAddDrawer} onClose={() => setShowAddDrawer(false)} onCreated={handleCreated} />
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
      <ExportModal open={showExportModal} onClose={() => setShowExportModal(false)} />
      <Toast title={toastState.title} variant={toastState.variant} open={toastState.open} onOpenChange={setToastOpen} />
    </>
  );
}
