"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { TagStat } from "./page";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const PER_PAGE = 10;

interface Props {
  initialTags: TagStat[];
}

export function ManageTagsClient({ initialTags }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [tags, setTags] = useState<TagStat[]>(initialTags);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = tags.filter((t) => t.tag.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function toggleAll() {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map((t) => t.tag)));
    }
  }

  function toggle(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const token = await getToken();
      await Promise.all(
        [...selected].map((tag) =>
          fetch(`${API_URL}/v1/tags/${encodeURIComponent(tag)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token ?? ""}` },
          }),
        ),
      );
      setTags((prev) => prev.filter((t) => !selected.has(t.tag)));
      setSelected(new Set());
      setPage(1);
    } finally {
      setDeleting(false);
    }
  }

  const allOnPageSelected = paginated.length > 0 && paginated.every((t) => selected.has(t.tag));

  return (
    <div className="space-y-4">
      {/* Description banner */}
      <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
        <svg className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <p className="text-sm text-emerald-800">
          Tags are identifiers for a contact, which can be used to filter contacts in your campaign audience.
        </p>
      </div>

      {/* Stats */}
      <div className="text-sm text-gray-600 space-y-0.5 px-1">
        <p><span className="font-medium text-gray-900">Total Tags:</span> {tags.length}</p>
        <p><span className="font-medium text-gray-900">Total Contacts Using Tags:</span> {tags.reduce((s, t) => s + t.count, 0)}</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search Tags"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-gray-400"
          />
        </div>

        {selected.size > 0 && (
          <button
            onClick={() => void deleteSelected()}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {deleting ? "Deleting…" : `Delete Tags (${selected.size})`}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tag Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Contacts</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Created On</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Created By</th>
              <th className="w-16 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  {search ? "No tags match your search." : "No tags in use yet."}
                </td>
              </tr>
            ) : (
              paginated.map(({ tag, count }) => (
                <tr key={tag} className={`hover:bg-gray-50/50 transition-colors ${selected.has(tag) ? "bg-emerald-50/40" : ""}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(tag)}
                      onChange={() => toggle(tag)}
                      className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      {tag}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{count} {count === 1 ? "contact" : "contacts"}</td>
                  <td className="px-4 py-3 text-gray-400">—</td>
                  <td className="px-4 py-3 text-gray-400">—</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setSelected(new Set([tag])); void deleteSelected(); }}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 text-sm rounded-lg font-medium ${p === page ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
