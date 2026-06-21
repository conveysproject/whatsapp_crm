"use client";

import { JSX, useRef, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_FIELDS } from "./defaultFields";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

function CopyKey({ value }: { value: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function copy() {
    void navigator.clipboard.writeText(value);
    if (timer.current) clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-mono"
      title="Copy API keyname"
    >
      {value}
      <span className="text-[10px]">{copied ? "✓" : "⧉"}</span>
    </button>
  );
}

export default function DefaultFieldsPanel(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  const { data: hiddenFields = [] } = useQuery<string[]>({
    queryKey: ["org-contact-field-visibility"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/organizations/me`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { data?: { settings?: { contactConfig?: { hiddenFields?: string[] } } } };
      return json.data?.settings?.contactConfig?.hiddenFields ?? [];
    },
  });

  const [localHidden, setLocalHidden] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalHidden(hiddenFields);
  }, [hiddenFields]);

  const save = useMutation({
    mutationFn: async (hidden: string[]) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/organizations/me`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { contactConfig: { hiddenFields: hidden } } }),
      });
      if (!res.ok) throw new Error("Failed to save");
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void qc.invalidateQueries({ queryKey: ["org-contact-field-visibility"] });
    },
  });

  function toggle(key: string) {
    setLocalHidden((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  const dirty = JSON.stringify([...localHidden].sort()) !== JSON.stringify([...hiddenFields].sort());

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Default Fields</p>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-600">Saved ✓</span>}
          {dirty && (
            <button
              onClick={() => save.mutate(localHidden)}
              disabled={save.isPending}
              className="px-3 py-1 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
        <span>Field Label</span>
        <span>Type</span>
        <span>Visible</span>
      </div>
      <div className="divide-y divide-gray-50">
        {DEFAULT_FIELDS.map((f) => {
          const isHidden = localHidden.includes(f.key);
          return (
            <div key={f.key} className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-3 items-center">
              <div className="min-w-0">
                <p className={`text-sm font-medium ${isHidden ? "text-gray-400" : "text-gray-900"}`}>{f.label}</p>
                <CopyKey value={f.key} />
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap">{f.type}</span>
              {f.toggleable ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={!isHidden}
                  onClick={() => toggle(f.key)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${!isHidden ? "bg-emerald-500" : "bg-gray-200"}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${!isHidden ? "translate-x-4" : "translate-x-1"}`}
                  />
                </button>
              ) : (
                <span className="inline-flex h-5 w-9 items-center justify-center">
                  <span className="text-[10px] text-gray-300 font-medium">always</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
