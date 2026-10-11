"use client";

import { useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { clientFetch } from "@/lib/client-fetch";
import { profileRows } from "@/lib/account-details";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface EditableProfile {
  name: string;
  phone: string | null;
  website: string | null;
  location: string | null;
  industry: string | null;
  subCategory: string | null;
}

type FormState = Record<keyof EditableProfile, string>;

const FIELDS: Array<{ key: keyof EditableProfile; label: string; max: number; type?: string }> = [
  { key: "name", label: "Organization name", max: 255 },
  { key: "phone", label: "Phone", max: 20, type: "tel" },
  { key: "website", label: "Website", max: 255, type: "url" },
  { key: "location", label: "Location", max: 255 },
  { key: "industry", label: "Industry", max: 100 },
  { key: "subCategory", label: "Sub-category", max: 100 },
];

function toForm(p: EditableProfile): FormState {
  return { name: p.name, phone: p.phone ?? "", website: p.website ?? "", location: p.location ?? "", industry: p.industry ?? "", subCategory: p.subCategory ?? "" };
}

export function ProfileEditor({ profile, canEdit }: { profile: EditableProfile; canEdit: boolean }): JSX.Element {
  const router = useRouter();
  const { getToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(toForm(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (!form.name.trim()) { setError("Organization name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await clientFetch(`${API_URL}/v1/organizations/me`, {
        method: "PATCH",
        token: token ?? "",
        silent: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "We couldn't save your changes. Try again.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("We couldn't save your changes. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function cancel(): void {
    setForm(toForm(profile));
    setError(null);
    setEditing(false);
  }

  const rows = profileRows({ ...profile, facebookPageId: null, instagramAccountId: null });

  return (
    <section className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Business profile</h2>
        {canEdit && !editing && (
          <button type="button" onClick={() => { setForm(toForm(profile)); setEditing(true); }} className="rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">Edit</button>
        )}
      </div>

      {editing ? (
        <form className="px-5 py-4 space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-sm text-gray-500">{f.label}</span>
              <input
                type={f.type ?? "text"}
                value={form[f.key]}
                maxLength={f.max}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </label>
          ))}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? "Saving…" : "Save changes"}</button>
            <button type="button" onClick={cancel} disabled={saving} className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      ) : (
        <dl className="px-5">
          {rows.length === 0 ? (
            <div className="py-3.5 text-sm text-gray-400">No business details added yet.{canEdit ? " Use Edit to add them." : ""}</div>
          ) : (
            rows.map((r) => (
              <div key={r.label} className="flex flex-col gap-1 py-3.5 border-b border-gray-100 last:border-0 sm:flex-row sm:items-center sm:gap-4">
                <dt className="text-sm text-gray-500 sm:w-64 sm:shrink-0">{r.label}</dt>
                <dd className="min-w-0 break-all text-sm font-medium text-gray-900">{r.value}</dd>
              </div>
            ))
          )}
        </dl>
      )}
    </section>
  );
}
