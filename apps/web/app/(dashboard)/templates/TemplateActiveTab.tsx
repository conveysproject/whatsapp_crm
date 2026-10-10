"use client";

import { useState, useMemo, useEffect, useCallback, type JSX } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TemplateRow, COLS, type TemplateData } from "./TemplateRow";
import { ANALYTICS_RANGES, type AnalyticsRange } from "@/lib/template-analytics";
import { fetchTemplateListStats, sortTemplates, type SortDir, type SortKey, type StatsMap } from "@/lib/template-list-stats";

const NO_STATS: StatsMap = {};

function SortHeader({ label, k, sortKey, dir, onSort, className }: {
  label: string; k: SortKey; sortKey: SortKey | null; dir: SortDir; onSort: (k: SortKey) => void; className: string;
}): JSX.Element {
  const active = sortKey === k;
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  const justify = className.includes("text-right") ? "justify-end" : "";
  return (
    <span className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex w-full items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-gray-800 ${justify} ${active ? "text-gray-800" : "text-gray-500"}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "text-gray-700" : "text-gray-300"}`} aria-hidden="true" />
      </button>
    </span>
  );
}

const STATUSES = ["all", "draft", "approved", "pending", "rejected", "paused", "disabled", "in_appeal", "flagged", "limit_exceeded", "pending_deletion", "archived"] as const;
const CATEGORIES = ["all", "marketing", "utility", "authentication"] as const;

type StatusFilter = (typeof STATUSES)[number];
type CategoryFilter = (typeof CATEGORIES)[number];

function ReviewModal({ onClose }: { onClose: () => void }): JSX.Element | null {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Green check icon */}
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          WhatsApp can take up to 24 hours to review (approve / reject) a template.
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-7">
          In some cases, after template submission, the approval / rejection comes within the first 1 minute itself.
          However, if the template&apos;s status shows pending (yellow) even after 1 minute, then it implies that
          WhatsApp might have sent it for manual review, which typically takes up to 24 hours.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-[#0a8f5c] hover:bg-[#087a4f] text-white font-medium py-3 rounded-lg transition-colors"
        >
          Understood
        </button>
      </div>
    </div>,
    document.body
  );
}

function Chevron(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function TemplateActiveTab({ templates }: { templates: TemplateData[] }): JSX.Element {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [showModal, setShowModal] = useState(false);
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const statsQuery = useQuery<StatsMap, Error>({
    queryKey: ["template-list-stats", range],
    queryFn: () => fetchTemplateListStats(range),
    retry: false,
    placeholderData: keepPreviousData,
  });
  const stats = statsQuery.data ?? NO_STATS;
  const statsReady = !statsQuery.isLoading;
  const onSort = (k: SortKey): void => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); }
  };
  const handleRefresh = useCallback(() => { router.refresh(); }, [router]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (categoryFilter !== "all" && t.category.toLowerCase() !== categoryFilter) return false;
      return true;
    });
  }, [templates, search, statusFilter, categoryFilter]);
  const rows = useMemo(() => sortTemplates(filtered, stats, sortKey, sortDir), [filtered, stats, sortKey, sortDir]);

  return (
    <>
      {showModal && <ReviewModal onClose={() => setShowModal(false)} />}

      <div className="space-y-3">
        {/* Search + filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search a template by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="appearance-none pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="all">Status</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
              <option value="paused">Paused</option>
              <option value="disabled">Disabled</option>
              <option value="in_appeal">In appeal</option>
              <option value="flagged">Flagged</option>
              <option value="limit_exceeded">Limit exceeded</option>
              <option value="pending_deletion">Pending deletion</option>
              <option value="archived">Archived</option>
            </select>
            {/* Flag icon */}
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18M3 6l9-3 9 3-9 3-9-3z" />
            </svg>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"><Chevron /></div>
          </div>

          {/* Category filter */}
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
              className="appearance-none pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="all">Category</option>
              <option value="marketing">Marketing</option>
              <option value="utility">Utility</option>
              <option value="authentication">Authentication</option>
            </select>
            {/* Tag icon */}
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M3 3l7 1 10 10a2 2 0 010 2.828l-4.172 4.172a2 2 0 01-2.828 0L3 11V3z" />
            </svg>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"><Chevron /></div>
          </div>
        </div>

        {/* Stats period */}
        <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
          <span>Sent / delivered / read for</span>
          <div role="group" aria-label="Statistics period" className="inline-flex overflow-hidden rounded-lg border border-gray-300 bg-white">
            {ANALYTICS_RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                aria-pressed={range === r.value}
                className={`px-2.5 py-1 text-xs font-medium ${range === r.value ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {statsQuery.isError && (
          <p role="status" className="text-xs text-amber-700">Could not load sending statistics. The list is still up to date.</p>
        )}

        {/* Amber review-time banner */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
          <svg className="w-4 h-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M12 8v4m0 4h.01" />
          </svg>
          <span>
            WhatsApp can take up to 24 hours to review (approve / reject) a template.{" "}
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="font-medium underline underline-offset-2 hover:text-amber-900 transition-colors"
            >
              See More
            </button>
          </span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
          <div className="flex items-center px-4 py-2 bg-gray-50 rounded-t-xl">
            <SortHeader label="Name" k="name" sortKey={sortKey} dir={sortDir} onSort={onSort} className="flex-1 min-w-0 pr-3" />
            <span className={`${COLS.category} text-xs font-medium text-gray-500 uppercase tracking-wide`}>Category</span>
            <span className={`${COLS.status} text-xs font-medium text-gray-500 uppercase tracking-wide`}>Status</span>
            <SortHeader label="Sent" k="sent" sortKey={sortKey} dir={sortDir} onSort={onSort} className={COLS.sent} />
            <span className={`${COLS.delivered} text-xs font-medium text-gray-500 uppercase tracking-wide`}>Delivered</span>
            <SortHeader label="Read rate" k="readRate" sortKey={sortKey} dir={sortDir} onSort={onSort} className={COLS.read} />
            <SortHeader label="Updated" k="updatedAt" sortKey={sortKey} dir={sortDir} onSort={onSort} className={COLS.updated} />
            <span className={`${COLS.actions} text-xs font-medium text-gray-500 uppercase tracking-wide`}>Actions<span className="w-6" /></span>
          </div>
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              {templates.length === 0 ? "No templates yet." : "No templates match your filters."}
            </p>
          ) : (
            rows.map((t) => <TemplateRow key={t.id} template={t} onRefresh={handleRefresh} stat={stats[t.id]} statsReady={statsReady} range={range} />)
          )}
        </div>
      </div>
    </>
  );
}
