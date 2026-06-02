"use client";

import { JSX, useState } from "react";
import type { TagStat } from "./page";

interface Props {
  initialTags: TagStat[];
}

export function TagsClient({ initialTags }: Props): JSX.Element {
  const [search, setSearch] = useState("");

  const filtered = initialTags.filter((t) =>
    t.tag.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags…"
          className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors placeholder-gray-400"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-10 text-center text-gray-400 text-sm">
          {search ? "No tags match your search." : "No tags in use yet. Add tags to contacts or run a flow with the Add Tag action."}
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {filtered.map(({ tag, count }) => (
            <div key={tag} className="flex items-center justify-between px-5 py-3">
              <span className="inline-flex items-center bg-gray-100 text-gray-700 rounded-full text-sm px-3 py-1 font-medium">
                {tag}
              </span>
              <span className="text-xs text-gray-400 tabular-nums">
                {count} {count === 1 ? "contact" : "contacts"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
