"use client";

import { JSX, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { TagInput } from "./TagInput";
import { useLeadStatuses } from "@/hooks/useLeadStatuses";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Segment { id: string; name: string }
interface Group { id: string; title: string }
interface CustomField { id: string; inputName: string }
interface CfFilter { fieldId: string; value: string }

interface Props {
  open: boolean;
  onClose: () => void;
}

function buildParams(
  leadStatusIds: string[],
  tags: string[],
  segmentId: string | null,
  groupIds: string[],
  cfFilters: CfFilter[],
): URLSearchParams {
  const p = new URLSearchParams();
  leadStatusIds.forEach((id) => p.append("leadStatusId", id));
  tags.forEach((t) => p.append("tags", t));
  if (segmentId) p.set("segmentId", segmentId);
  groupIds.forEach((g) => p.append("groupIds", g));
  cfFilters.forEach((f) => { if (f.fieldId && f.value) p.append(`cf[${f.fieldId}]`, f.value); });
  return p;
}

export function ExportModal({ open, onClose }: Props): JSX.Element | null {
  const { getToken } = useAuth();
  const { data: leadStatuses } = useLeadStatuses();

  const [segments, setSegments] = useState<Segment[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [segmentsError, setSegmentsError] = useState(false);
  const [groupsError, setGroupsError] = useState(false);

  const [leadStatusIds, setLeadStatusIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [cfFilters, setCfFilters] = useState<CfFilter[]>([]);

  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [countError, setCountError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch reference data on mount
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const token = await getToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };

      void Promise.all([
        fetch(`${API_URL}/v1/segments`, { headers }).then((r) => r.ok ? r.json() as Promise<{ data: Segment[] }> : null),
        fetch(`${API_URL}/v1/contact-groups?archived=false`, { headers }).then((r) => r.ok ? r.json() as Promise<{ data: Group[] }> : null),
        fetch(`${API_URL}/v1/contacts/custom-fields`, { headers }).then((r) => r.ok ? r.json() as Promise<{ data: CustomField[] }> : null),
      ]).then(([segsRes, groupsRes, cfRes]) => {
        if (segsRes) setSegments(segsRes.data ?? []);
        else setSegmentsError(true);
        if (groupsRes) setGroups(groupsRes.data ?? []);
        else setGroupsError(true);
        if (cfRes) setCustomFields(cfRes.data ?? []);
      });
    })();
  }, [open, getToken]);

  // Reset filter state when modal opens
  useEffect(() => {
    if (open) {
      setLeadStatusIds([]);
      setTags([]);
      setSegmentId(null);
      setGroupIds([]);
      setCfFilters([]);
      setCount(null);
      setCountError(false);
    }
  }, [open]);

  const fetchCount = useCallback(async (
    lsIds: string[], t: string[], seg: string | null, gids: string[], cf: CfFilter[]
  ) => {
    const token = await getToken();
    if (!token) return;
    setCounting(true);
    setCountError(false);
    try {
      const params = buildParams(lsIds, t, seg, gids, cf);
      const res = await fetch(`${API_URL}/v1/contacts/export/count?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("count failed");
      const body = await res.json() as { data: { count: number } };
      setCount(body.data.count);
    } catch {
      setCountError(true);
    } finally {
      setCounting(false);
    }
  }, [getToken]);

  // Debounced count on filter change
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchCount(leadStatusIds, tags, segmentId, groupIds, cfFilters);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [open, leadStatusIds, tags, segmentId, groupIds, cfFilters, fetchCount]);

  async function handleDownload() {
    const token = await getToken();
    if (!token) return;
    setDownloading(true);
    try {
      const params = buildParams(leadStatusIds, tags, segmentId, groupIds, cfFilters);
      const res = await fetch(`${API_URL}/v1/contacts/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().split("T")[0]!;
      a.download = `contacts-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  function toggleLeadStatus(id: string) {
    setLeadStatusIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function toggleGroup(id: string) {
    setGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  }

  function addCfFilter() {
    setCfFilters((prev) => [...prev, { fieldId: "", value: "" }]);
  }

  function updateCfFilter(index: number, patch: Partial<CfFilter>) {
    setCfFilters((prev) => prev.map((f, i) => i === index ? { ...f, ...patch } : f));
  }

  function removeCfFilter(index: number) {
    setCfFilters((prev) => prev.filter((_, i) => i !== index));
  }

  const countLabel = (() => {
    if (counting) return "Estimating…";
    if (countError) return "Unable to estimate count";
    if (count === null) return "";
    if (count === 0) return "0 contacts match — adjust filters";
    return `${count.toLocaleString()} contacts will be exported`;
  })();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Export Contacts</h2>
          <p className="text-sm text-gray-500 mt-0.5">Apply filters to narrow the export. All filters are optional.</p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Lead Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Lead Status</label>
            <div className="flex flex-wrap gap-2">
              {leadStatuses.map(({ id, name, color }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleLeadStatus(id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                    leadStatusIds.includes(id)
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-brand-400"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: leadStatusIds.includes(id) ? "#fff" : color }}
                  />
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags <span className="text-gray-400 font-normal text-xs">(contact must have ALL)</span>
            </label>
            <TagInput tags={tags} onChange={setTags} />
          </div>

          {/* Segment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Segment</label>
            {segmentsError ? (
              <p className="text-sm text-red-500">Failed to load segments</p>
            ) : (
              <select
                value={segmentId ?? ""}
                onChange={(e) => setSegmentId(e.target.value || null)}
                className="w-full h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">All contacts (no segment filter)</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Groups */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Groups <span className="text-gray-400 font-normal text-xs">(contact must be in ANY)</span>
            </label>
            {groupsError ? (
              <p className="text-sm text-red-500">Failed to load groups</p>
            ) : groups.length === 0 ? (
              <p className="text-sm text-gray-400">No groups found</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                      groupIds.includes(g.id)
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-gray-700 border-gray-300 hover:border-brand-400"
                    }`}
                  >
                    {g.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Custom Field Filters */}
          {customFields.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Fields <span className="text-gray-400 font-normal text-xs">(all must match, contains)</span>
              </label>
              <div className="space-y-2">
                {cfFilters.map((f, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      value={f.fieldId}
                      onChange={(e) => updateCfFilter(i, { fieldId: e.target.value })}
                      className="flex-1 h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Select field</option>
                      {customFields.map((cf) => (
                        <option key={cf.id} value={cf.id}>{cf.inputName}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={f.value}
                      onChange={(e) => updateCfFilter(i, { value: e.target.value })}
                      placeholder="Value contains…"
                      className="flex-1 h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeCfFilter(i)}
                      className="text-gray-400 hover:text-red-500 text-lg leading-none px-1"
                      aria-label="Remove filter"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addCfFilter}
                className="mt-2 text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                + Add custom field filter
              </button>
            </div>
          )}
        </div>

        {/* Count */}
        <div className="px-6 py-3 border-t border-gray-100">
          <p className={`text-sm font-medium ${
            count === 0 ? "text-amber-600" : countError ? "text-red-500" : "text-gray-600"
          }`}>
            {countLabel}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading || count === 0}
            className="h-9 px-4 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {downloading ? "Downloading…" : "Download CSV"}
          </button>
        </div>
      </div>
    </div>
  );
}
