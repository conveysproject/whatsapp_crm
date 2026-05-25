"use client";

import { JSX, useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import type { Contact, EditableContact } from "./AddContactModal";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

const LIFECYCLE_STAGES = ["lead", "prospect", "customer", "loyal", "churned"] as const;

const LANGUAGES = [
  { code: "en", label: "English (en)" },
  { code: "hi", label: "Hindi (hi)" },
  { code: "mr", label: "Marathi (mr)" },
  { code: "ta", label: "Tamil (ta)" },
  { code: "te", label: "Telugu (te)" },
  { code: "kn", label: "Kannada (kn)" },
  { code: "ml", label: "Malayalam (ml)" },
  { code: "gu", label: "Gujarati (gu)" },
  { code: "bn", label: "Bengali (bn)" },
  { code: "pa", label: "Punjabi (pa)" },
  { code: "ur", label: "Urdu (ur)" },
  { code: "ar", label: "Arabic (ar)" },
  { code: "fr", label: "French (fr)" },
  { code: "de", label: "German (de)" },
  { code: "es", label: "Spanish (es)" },
  { code: "pt", label: "Portuguese (pt)" },
  { code: "ru", label: "Russian (ru)" },
  { code: "zh", label: "Chinese (zh)" },
  { code: "ja", label: "Japanese (ja)" },
  { code: "ko", label: "Korean (ko)" },
  { code: "sv", label: "Swedish (sv)" },
  { code: "id", label: "Indonesian (id)" },
  { code: "ms", label: "Malay (ms)" },
];

interface Country { id: number; name: string; isoCode: string | null; phoneCode: number | null }
interface ContactGroup { id: string; title: string }
interface CustomField {
  id: string;
  inputName: string;
  fieldKey: string;
  inputType: string;
  description: string | null;
  placeholder: string | null;
  defaultValue: string | null;
  options: string[];
  isRequired: boolean;
  isReadOnly: boolean;
}

interface Props {
  open: boolean;
  contact: EditableContact | undefined;
  onClose: () => void;
  onUpdated: (contact: Contact) => void;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }): JSX.Element {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          "relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1",
          checked ? "bg-brand-600" : "bg-gray-300",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

function SectionHeader({ title }: { title: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{title}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

function FieldSkeleton(): JSX.Element {
  return <div className="h-9 rounded-lg bg-gray-100 animate-pulse" />;
}

export function EditContactDrawer({ open, contact, onClose, onUpdated }: Props): JSX.Element {
  const { getToken } = useAuth();

  const initials = [contact?.firstName, contact?.lastName]
    .filter(Boolean)
    .map((s) => s![0].toUpperCase())
    .join("") || (contact?.phoneNumber?.slice(-2) ?? "?");

  const displayName =
    [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ||
    contact?.name ||
    contact?.phoneNumber ||
    "Contact";

  const [form, setForm] = useState({
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    email: contact?.email ?? "",
    countryId: contact?.countryId != null ? String(contact.countryId) : "",
    languageCode: contact?.languageCode ?? "",
    lifecycleStage: contact?.lifecycleStage ?? "lead",
    groupIds: contact?.groupIds ?? ([] as string[]),
    whatsappOptOut: contact?.whatsappOptOut ?? false,
    disableBot: contact?.disableBot ?? false,
  });
  const [tags, setTags] = useState<string[]>(contact?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>(
    contact?.customFields
      ? Object.fromEntries(Object.entries(contact.customFields).map(([k, v]) => [k, String(v)]))
      : {}
  );
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const groupDropdownRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: countries, isLoading: loadingCountries } = useQuery<Country[]>({
    queryKey: ["countries"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/v1/countries`);
      if (!res.ok) return [];
      return (await res.json() as { data: Country[] }).data;
    },
    enabled: open,
    staleTime: Infinity,
  });

  const { data: groups = [], isLoading: loadingGroups } = useQuery<ContactGroup[]>({
    queryKey: ["contact-groups", false],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contact-groups?archived=false`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: ContactGroup[] }).data;
    },
    enabled: open,
  });

  const { data: customFields = [] } = useQuery<CustomField[]>({
    queryKey: ["custom-fields"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/custom-fields`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: CustomField[] }).data;
    },
    enabled: open,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) {
        setGroupDropdownOpen(false);
      }
    }
    if (groupDropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [groupDropdownOpen]);

  function toggleGroup(id: string) {
    setForm((f) => ({
      ...f,
      groupIds: f.groupIds.includes(id) ? f.groupIds.filter((g) => g !== id) : [...f.groupIds, id],
    }));
  }

  function addTag(value: string) {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) setTags((prev) => [...prev, trimmed]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact) return;
    const missingRequired = customFields.filter(
      (cf) => cf.isRequired && !customFieldValues[cf.inputName]?.trim()
    );
    if (missingRequired.length > 0) {
      setError(`Required fields missing: ${missingRequired.map((f) => f.inputName).join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const body: Record<string, unknown> = {
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        email: form.email || undefined,
        countryId: form.countryId ? Number(form.countryId) : undefined,
        languageCode: form.languageCode || undefined,
        lifecycleStage: form.lifecycleStage,
        tags,
        groupIds: form.groupIds,
        whatsappOptOut: form.whatsappOptOut,
        disableBot: form.disableBot,
      };
      const hasCustom = Object.values(customFieldValues).some((v) => v.trim());
      if (hasCustom) {
        body["customFields"] = Object.fromEntries(
          Object.entries(customFieldValues).filter(([, v]) => v.trim())
        );
      }
      const res = await fetch(`${API_URL}/v1/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { data?: Contact; error?: { message: string } };
      if (!res.ok) { setError(json.error?.message ?? "Failed to update contact."); return; }
      onUpdated(json.data!);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-[480px] max-w-full bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-gray-200 shrink-0">
          <div className="w-11 h-11 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
            <span className="text-brand-700 font-semibold text-sm">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{displayName}</p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{contact?.phoneNumber}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-2 space-y-1">

            {/* ── Identity ─────────────────────────────────────── */}
            <SectionHeader title="Identity" />
            <div className="space-y-3 pb-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">First Name</label>
                  <input
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors"
                    placeholder="First name"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">Last Name</label>
                  <input
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors"
                    placeholder="Last name"
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Email</label>
                <input
                  type="email"
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">Country</label>
                  {loadingCountries ? (
                    <FieldSkeleton />
                  ) : (
                    <select
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors"
                      value={form.countryId}
                      onChange={(e) => setForm((f) => ({ ...f, countryId: e.target.value }))}
                    >
                      <option value="">Select country</option>
                      {(countries ?? []).map((c) => (
                        <option key={c.id} value={String(c.id)}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">Language</label>
                  <select
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors"
                    value={form.languageCode}
                    onChange={(e) => setForm((f) => ({ ...f, languageCode: e.target.value }))}
                  >
                    <option value="">Select language</option>
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Lifecycle ────────────────────────────────────── */}
            <SectionHeader title="Lifecycle" />
            <div className="space-y-3 pb-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Stage</label>
                <select
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors"
                  value={form.lifecycleStage}
                  onChange={(e) => setForm((f) => ({ ...f, lifecycleStage: e.target.value }))}
                >
                  {LIFECYCLE_STAGES.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Tags</label>
                <div className="min-h-[38px] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex flex-wrap gap-1.5 items-center focus-within:ring-2 focus-within:ring-brand-500 focus-within:bg-white transition-colors cursor-text">
                  {tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 bg-gray-200 text-gray-700 rounded-full text-xs px-2 py-0.5 shrink-0">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500 leading-none ml-0.5">&times;</button>
                    </span>
                  ))}
                  <input
                    className="flex-1 min-w-[80px] text-sm bg-transparent outline-none placeholder-gray-400"
                    placeholder={tags.length === 0 ? "Add tag…" : ""}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
                      if (e.key === "Backspace" && !tagInput && tags.length > 0) removeTag(tags[tags.length - 1]!);
                    }}
                    onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
                  />
                </div>
                <p className="text-xs text-gray-400">Press Enter or comma to add a tag</p>
              </div>
            </div>

            {/* ── Groups & Settings ────────────────────────────── */}
            <SectionHeader title="Groups & Settings" />
            <div className="space-y-3 pb-3">
              {loadingGroups ? (
                <FieldSkeleton />
              ) : groups.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">Groups</label>
                  <div ref={groupDropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setGroupDropdownOpen((v) => !v)}
                      className="w-full min-h-[38px] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors"
                    >
                      <div className="flex flex-wrap gap-1.5 flex-1">
                        {form.groupIds.length === 0 ? (
                          <span className="text-gray-400">Select groups…</span>
                        ) : (
                          form.groupIds.map((id) => {
                            const g = groups.find((gr) => gr.id === id);
                            return g ? (
                              <span key={id} className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 border border-brand-200 rounded-full text-xs px-2 py-0.5">
                                {g.title}
                                <span
                                  role="button"
                                  aria-label={`Remove ${g.title}`}
                                  onClick={(e) => { e.stopPropagation(); toggleGroup(id); }}
                                  className="hover:text-brand-900 cursor-pointer leading-none"
                                >
                                  &times;
                                </span>
                              </span>
                            ) : null;
                          })
                        )}
                      </div>
                      <span className={`text-gray-400 shrink-0 transition-transform ${groupDropdownOpen ? "rotate-180" : ""}`}>▾</span>
                    </button>
                    {groupDropdownOpen && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {groups.map((g) => {
                          const selected = form.groupIds.includes(g.id);
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => toggleGroup(g.id)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-sm text-left"
                            >
                              <span className={[
                                "w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors",
                                selected ? "bg-brand-600 border-brand-600" : "border-gray-300",
                              ].join(" ")}>
                                {selected && <span className="text-white text-[10px] leading-none">✓</span>}
                              </span>
                              <span className="text-gray-700">{g.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <Toggle
                checked={form.whatsappOptOut}
                onChange={(v) => setForm((f) => ({ ...f, whatsappOptOut: v }))}
                label="Opt out Marketing Messages"
              />
              <Toggle
                checked={!form.disableBot}
                onChange={(v) => setForm((f) => ({ ...f, disableBot: !v }))}
                label="Enable Reply Bot"
              />
            </div>

            {/* ── Custom Fields ────────────────────────────────── */}
            {customFields.length > 0 && (
              <>
                <SectionHeader title="Custom Fields" />
                <div className="space-y-3 pb-3">
                  {customFields.map((cf) => (
                    <div key={cf.id} className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-500">
                        {cf.inputName}
                        {cf.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      {cf.inputType === "boolean" ? (
                        <Toggle
                          checked={customFieldValues[cf.inputName] === "true"}
                          onChange={(v) => setCustomFieldValues((vals) => ({ ...vals, [cf.inputName]: v ? "true" : "false" }))}
                          label=""
                        />
                      ) : cf.inputType === "select" ? (
                        <select
                          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          value={customFieldValues[cf.inputName] ?? ""}
                          onChange={(e) => setCustomFieldValues((v) => ({ ...v, [cf.inputName]: e.target.value }))}
                          disabled={cf.isReadOnly}
                        >
                          <option value="">Select…</option>
                          {cf.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={cf.inputType === "number" ? "number" : cf.inputType === "date" ? "date" : cf.inputType === "time" ? "time" : cf.inputType === "email" ? "email" : cf.inputType === "url" ? "url" : "text"}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          placeholder={cf.placeholder ?? cf.inputName}
                          value={customFieldValues[cf.inputName] ?? ""}
                          onChange={(e) => setCustomFieldValues((v) => ({ ...v, [cf.inputName]: e.target.value }))}
                          disabled={cf.isReadOnly}
                          required={cf.isRequired}
                        />
                      )}
                      {cf.description && <p className="text-xs text-gray-400">{cf.description}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-2">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
