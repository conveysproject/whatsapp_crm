"use client";

import { useState, useMemo, type JSX } from "react";
import { TemplateRow, type TemplateData } from "./TemplateRow";

const STATUSES = ["all", "approved", "pending", "rejected"] as const;
const CATEGORIES = ["all", "marketing", "utility", "authentication"] as const;

type StatusFilter = (typeof STATUSES)[number];
type CategoryFilter = (typeof CATEGORIES)[number];

function ReviewModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
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
    </div>
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [showModal, setShowModal] = useState(false);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (categoryFilter !== "all" && t.category.toLowerCase() !== categoryFilter) return false;
      return true;
    });
  }, [templates, search, statusFilter, categoryFilter]);

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
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
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
            <span className="flex-1 min-w-0 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</span>
            <span className="w-20 shrink-0 text-xs font-medium text-gray-500 uppercase tracking-wide">Language</span>
            <span className="w-28 shrink-0 text-xs font-medium text-gray-500 uppercase tracking-wide">Category</span>
            <span className="w-24 shrink-0 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</span>
            <span className="w-32 shrink-0 text-xs font-medium text-gray-500 uppercase tracking-wide">Updated On</span>
            <span className="w-20 shrink-0 text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Action</span>
          </div>
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              {templates.length === 0 ? "No templates yet." : "No templates match your filters."}
            </p>
          ) : (
            filtered.map((t) => <TemplateRow key={t.id} template={t} />)
          )}
        </div>
      </div>
    </>
  );
}
