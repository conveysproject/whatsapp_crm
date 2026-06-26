"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X, RefreshCw, Send, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccess } from "@/lib/can";
import { PermissionGate } from "@/components/PermissionGate";
import { SegmentBuilderV2 } from "@/components/segments/SegmentBuilderV2";
import type { FilterRule, MatchMode } from "@/components/segments/types";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Segment {
  id: string;
  name: string;
  filters: FilterRule[];
  match: MatchMode;
  whatsappOptedOnly: boolean;
  lastContactCount: number | null;
  lastSyncAt: string | null;
}

// ── Overview text generator ────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  firstName: "First Name", lastName: "Last Name", name: "Full Name",
  email: "Email", phoneNumber: "Phone Number", leadStatusId: "Status",
  createdAt: "Creation Date", lastMessageAt: "Last Message Date",
  closureDeadline: "Closure Deadline", whatsappOptOut: "WhatsApp Opt-out",
  waBlockedAt: "WA Blocked", disableBot: "Bot Disabled",
  countryCode: "Country", languageCode: "Language",
  assignedUserId: "Assigned User", groups: "Groups",
  externalId: "External ID", notes: "Notes", customField: "Custom Field",
};

const OP_LABELS: Record<string, string> = {
  is: "is", isNot: "is not", contains: "contains", doesNotContain: "does not contain",
  isEmpty: "is empty", hasAnyValue: "has any value", isTrue: "is true", isFalse: "is false",
  equals: "equals", lessThanDaysAgo: "less than X days ago", moreThanDaysAgo: "more than X days ago",
  after: "after", before: "before", on: "on", between: "between",
  memberOf: "member of", notMemberOf: "not member of",
};

function formatSyncDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RulePill({ rule }: { rule: FilterRule }) {
  if (rule.type === "tags") {
    const op = rule.operator === "is" ? "is" : "is not";
    return (
      <>
        <span className="font-medium text-gray-700">&#123;<span className="text-[#1D4B3E]">Tag</span>&#125;</span>
        {" "}{op}{" "}
        <span className="font-medium text-gray-700">{rule.value}</span>
      </>
    );
  }
  if (rule.type === "events") {
    return (
      <>
        <span className="font-medium text-gray-700">&#123;<span className="text-[#1D4B3E]">Event</span>&#125;</span>
        {" "}{rule.eventName ?? "?"}
      </>
    );
  }
  const label = FIELD_LABELS[rule.field] ?? rule.field;
  const op = OP_LABELS[rule.operator] ?? rule.operator;
  return (
    <>
      <span className="font-medium text-gray-700">&#123;<span className="text-[#1D4B3E]">Field</span>&#125; {label}</span>
      {" "}{op}
      {rule.value ? <> <span className="font-medium text-gray-700">{rule.value}</span></> : null}
    </>
  );
}

function OverviewText({ filters, match }: { filters: FilterRule[]; match: MatchMode }) {
  if (!filters.length) return <span className="italic text-gray-400">No filters</span>;
  const connector = match === "any" ? " OR " : " AND ";
  const parts: JSX.Element[] = [];
  filters.forEach((rule, i) => {
    if (i > 0) parts.push(<span key={`sep-${i}`} className="text-gray-400">{connector}</span>);
    parts.push(<RulePill key={i} rule={rule} />);
  });
  return <span className="text-sm text-gray-600">Where {parts}</span>;
}

function ActionButton({
  children, title, onClick, disabled, className = "",
}: {
  children: React.ReactNode; title: string; onClick: () => void;
  disabled?: boolean; className?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

function SegmentRow({
  segment, canManage, onRefresh, refreshingId, onDelete,
}: {
  segment: Segment; canManage: boolean;
  onRefresh: (id: string) => void; refreshingId: string | null;
  onDelete: (id: string, name: string) => void;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const isRefreshing = refreshingId === segment.id;

  return (
    <tr
      className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td className="px-4 py-3 text-sm font-medium text-gray-900 w-48 whitespace-nowrap">
        {segment.name}
      </td>
      <td className="px-4 py-3">
        <OverviewText filters={segment.filters} match={segment.match} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 w-36 whitespace-nowrap">
        {segment.lastContactCount !== null
          ? `${segment.lastContactCount} contact${segment.lastContactCount !== 1 ? "s" : ""}`
          : "—"}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 w-28 whitespace-nowrap">
        {formatSyncDate(segment.lastSyncAt)}
      </td>
      <td className="px-4 py-3 w-28">
        <div className={`flex items-center gap-1 justify-end transition-opacity ${hovered ? "opacity-100" : "opacity-0"}`}>
          {canManage && (
            <ActionButton title="Get Count" onClick={() => onRefresh(segment.id)} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </ActionButton>
          )}
          <ActionButton title="Send Campaign" onClick={() => router.push(`/campaigns/new?segmentId=${segment.id}`)}>
            <Send className="h-4 w-4" />
          </ActionButton>
          <ActionButton title="Edit" onClick={() => router.push(`/contacts/segments/${segment.id}`)}>
            <Pencil className="h-4 w-4" />
          </ActionButton>
          {canManage && (
            <ActionButton title="Delete" onClick={() => onDelete(segment.id, segment.name)} className="hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </ActionButton>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SegmentsPage(): JSX.Element {
  const { getToken } = useAuth();
  const { user } = useCurrentUser();
  const canManage = canAccess(user, "contacts_access");
  const qc = useQueryClient();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFilters, setNewFilters] = useState<FilterRule[]>([]);
  const [newMatch, setNewMatch] = useState<MatchMode>("all");
  const [newWhatsappOptedOnly, setNewWhatsappOptedOnly] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: segments = [], isLoading } = useQuery<Segment[]>({
    queryKey: ["segments"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: Segment[] }).data;
    },
  });

  const filtered = segments.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const createSegment = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, filters: newFilters, match: newMatch, whatsappOptedOnly: newWhatsappOptedOnly }),
      });
      if (!res.ok) throw new Error("Failed to create segment");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["segments"] });
      setModalOpen(false);
      setNewName(""); setNewFilters([]); setNewMatch("all"); setNewWhatsappOptedOnly(false);
    },
  });

  const deleteSegment = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed to delete segment");
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["segments"] }); setDeleteTarget(null); },
  });

  async function handleRefresh(id: string) {
    setRefreshingId(id);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/segments/${id}/evaluate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      void qc.invalidateQueries({ queryKey: ["segments"] });
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <PermissionGate permission="contacts_access">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Segments</h1>
            <p className="text-sm text-gray-500 mt-0.5">Create &amp; update audience segments</p>
          </div>
          {canManage && (
            <Button onClick={() => setModalOpen(true)}>+ Create New Segment</Button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-4 pt-4 pb-3">
            <input
              className="w-72 rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Search by segment name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              {search ? "No segments match your search." : "No segments yet. Create one to target contacts in campaigns."}
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Segment Name</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Overview</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">No. of Contacts</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Last Sync</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <SegmentRow
                    key={s.id}
                    segment={s}
                    canManage={canManage}
                    onRefresh={handleRefresh}
                    refreshingId={refreshingId}
                    onDelete={(id, name) => setDeleteTarget({ id, name })}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Segment modal */}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-semibold text-gray-900">Save Segment</Dialog.Title>
              <Dialog.Close className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></Dialog.Close>
            </div>
            <div className="mb-4">
              <input
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Segment name (e.g. All VIP Contacts)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <SegmentBuilderV2
              initial={newFilters} match={newMatch} whatsappOptedOnly={newWhatsappOptedOnly}
              onChange={setNewFilters} onMatchChange={setNewMatch} onWhatsappOptedOnlyChange={setNewWhatsappOptedOnly}
            />
            <div className="mt-6 flex justify-end">
              <Button onClick={() => createSegment.mutate()} disabled={!newName.trim() || createSegment.isPending}>
                {createSegment.isPending ? "Saving…" : "Save Segment"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete confirm dialog */}
      <Dialog.Root open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none">
            <Dialog.Title className="text-base font-semibold text-gray-900 mb-2">Delete Segment</Dialog.Title>
            <p className="text-sm text-gray-600 mb-6">
              Delete <span className="font-medium">{deleteTarget?.name}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteTarget && deleteSegment.mutate(deleteTarget.id)} disabled={deleteSegment.isPending}>
                {deleteSegment.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </PermissionGate>
  );
}
