# Edit Contact Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dual-mode Add/Edit modal with two focused components — an `AddContactModal` (add-only) and an `EditContactDrawer` (right-side slide-in panel with lifecycle, tags, and all contact fields).

**Architecture:** `EditableContact` interface is expanded then re-exported from `AddContactModal.tsx`. New `EditContactDrawer.tsx` imports it. `ContactsClient.tsx` is updated to open the drawer for edit and the modal for add. `AddContactModal.tsx` is stripped to add-only last (after `ContactsClient` stops passing edit props).

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript strict, Tailwind CSS, TanStack Query v5, Clerk auth.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/web/components/contacts/AddContactModal.tsx` | Modify | Expand `EditableContact`; then strip to add-only |
| `apps/web/components/contacts/EditContactDrawer.tsx` | **Create** | Right-drawer edit form — all contact fields + lifecycle + tags |
| `apps/web/components/contacts/ContactsClient.tsx` | Modify | Wire up drawer for edit, modal for add |

---

## Task 1: Expand `EditableContact` interface

**Files:**
- Modify: `apps/web/components/contacts/AddContactModal.tsx` (lines 16–28)

The current interface is missing `name`, `lifecycleStage`, and `tags`. The GET `/v1/contacts/:id` endpoint already returns all three — the interface just hasn't declared them.

- [ ] **Step 1: Replace `EditableContact` interface**

In `apps/web/components/contacts/AddContactModal.tsx`, replace lines 16–28:

```ts
export interface EditableContact {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  email: string | null;
  countryId: number | null;
  languageCode: string | null;
  lifecycleStage: string;
  tags: string[];
  whatsappOptOut: boolean;
  disableBot: boolean;
  groupIds: string[];
  customFields?: Record<string, string> | null;
}
```

- [ ] **Step 2: Update the type cast in `ContactsClient.tsx`**

In `apps/web/components/contacts/ContactsClient.tsx` at `handleEditClick` (~line 156), the intersection type `EditableContact & { customFields?: ... }` is now redundant since `customFields` is in the interface. Replace:

```ts
const json = await res.json() as { data: EditableContact & { customFields?: Record<string, string> | null } };
```

with:

```ts
const json = await res.json() as { data: EditableContact };
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/contacts/AddContactModal.tsx apps/web/components/contacts/ContactsClient.tsx
git commit -m "refactor(web): expand EditableContact with lifecycleStage, tags, name"
```

---

## Task 2: Create `EditContactDrawer.tsx`

**Files:**
- Create: `apps/web/components/contacts/EditContactDrawer.tsx`

- [ ] **Step 1: Create the file with the complete component**

Create `apps/web/components/contacts/EditContactDrawer.tsx` with this exact content:

```tsx
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
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/contacts/EditContactDrawer.tsx
git commit -m "feat(web): add EditContactDrawer — right-side slide-in panel with lifecycle and tags"
```

---

## Task 3: Update `ContactsClient.tsx` to use the drawer

**Files:**
- Modify: `apps/web/components/contacts/ContactsClient.tsx`

**Changes needed:**
1. Import `EditContactDrawer`
2. Remove `editContact` from the `AddContactModal` key / props
3. Add `showEditDrawer` state
4. `handleEditClick` opens the drawer (not the modal)
5. `handleCreated` no longer needs to clear `editContact`
6. `handleUpdated` closes the drawer (not the modal)
7. Render `<EditContactDrawer>` alongside `<AddContactModal>`

- [ ] **Step 1: Update the import line (line 11)**

Replace:
```ts
import { AddContactModal, type Contact, type EditableContact } from "./AddContactModal";
```
with:
```ts
import { AddContactModal, type Contact, type EditableContact } from "./AddContactModal";
import { EditContactDrawer } from "./EditContactDrawer";
```

- [ ] **Step 2: Add `showEditDrawer` state (after the existing `showModal` state, ~line 38)**

Add this line directly after `const [showModal, setShowModal] = useState(false);`:
```ts
const [showEditDrawer, setShowEditDrawer] = useState(false);
```

- [ ] **Step 3: Update `handleEditClick` (~line 147)**

Replace the last two lines of `handleEditClick`:
```ts
    setEditContact(json.data);
    setShowModal(true);
```
with:
```ts
    setEditContact(json.data);
    setShowEditDrawer(true);
```

- [ ] **Step 4: Update `handleCreated` (~line 139)**

Remove the `setEditContact(undefined)` line from `handleCreated` — the add modal no longer has any connection to `editContact`:

```ts
  function handleCreated(contact: Contact) {
    setContacts((prev) => [contact as ContactWithLabels, ...prev]);
    setShowModal(false);
    toast("Contact created", { variant: "success" });
    void fetchByLabel(selectedLabelId);
  }
```

- [ ] **Step 5: Update `handleUpdated` (~line 161)**

Replace:
```ts
  function handleUpdated(contact: Contact) {
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, ...contact } : c)));
    setShowModal(false);
    setEditContact(undefined);
    toast("Contact updated", { variant: "success" });
  }
```
with:
```ts
  function handleUpdated(contact: Contact) {
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, ...contact } : c)));
    setShowEditDrawer(false);
    setEditContact(undefined);
    toast("Contact updated", { variant: "success" });
  }
```

- [ ] **Step 6: Update `<AddContactModal>` render (~line 368)**

Replace the entire `<AddContactModal ... />` block:
```tsx
      <AddContactModal
        key={editContact?.id ?? "new"}
        open={showModal}
        onClose={() => { setShowModal(false); setEditContact(undefined); }}
        onCreated={handleCreated}
        editContact={editContact}
        onUpdated={handleUpdated}
      />
```
with:
```tsx
      <AddContactModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
      />

      <EditContactDrawer
        key={editContact?.id}
        open={showEditDrawer}
        contact={editContact}
        onClose={() => { setShowEditDrawer(false); setEditContact(undefined); }}
        onUpdated={handleUpdated}
      />
```

- [ ] **Step 7: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors. `editContact?` and `onUpdated?` are optional props on `AddContactModal` so removing them from the call site is valid TypeScript. Task 4 will clean those props out of the component definition.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/contacts/ContactsClient.tsx
git commit -m "refactor(web): wire EditContactDrawer in ContactsClient, decouple add modal from edit"
```

---

## Task 4: Strip `AddContactModal` to add-only

**Files:**
- Modify: `apps/web/components/contacts/AddContactModal.tsx`

Remove all edit-mode remnants. The component no longer receives `editContact` or `onUpdated`.

- [ ] **Step 1: Replace the full file content**

Replace `apps/web/components/contacts/AddContactModal.tsx` with this complete file:

```tsx
"use client";

import { JSX, FormEvent, useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";

export interface Contact {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
  lifecycleStage: string;
}

export interface EditableContact {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  email: string | null;
  countryId: number | null;
  languageCode: string | null;
  lifecycleStage: string;
  tags: string[];
  whatsappOptOut: boolean;
  disableBot: boolean;
  groupIds: string[];
  customFields?: Record<string, string> | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (contact: Contact) => void;
}

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

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

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

export function AddContactModal({ open, onClose, onCreated }: Props): JSX.Element | null {
  const { getToken } = useAuth();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    email: "",
    countryId: "",
    languageCode: "",
    groupIds: [] as string[],
    whatsappOptOut: false,
    disableBot: false,
  });
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const groupDropdownRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: countries = [] } = useQuery<Country[]>({
    queryKey: ["countries"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/v1/countries`);
      if (!res.ok) return [];
      return (await res.json() as { data: Country[] }).data;
    },
    enabled: open,
    staleTime: Infinity,
  });

  const { data: groups = [] } = useQuery<ContactGroup[]>({
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
    if (!open) {
      setForm({ firstName: "", lastName: "", phoneNumber: "", email: "", countryId: "", languageCode: "", groupIds: [], whatsappOptOut: false, disableBot: false });
      setCustomFieldValues({});
      setGroupDropdownOpen(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) {
        setGroupDropdownOpen(false);
      }
    }
    if (groupDropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [groupDropdownOpen]);

  useEffect(() => {
    if (customFields.length > 0) {
      setCustomFieldValues((prev) => {
        const next = { ...prev };
        customFields.forEach((cf) => {
          if (!(cf.inputName in next) && cf.defaultValue) {
            next[cf.inputName] = cf.defaultValue;
          }
        });
        return next;
      });
    }
  }, [customFields]);

  if (!open) return null;

  function toggleGroup(id: string) {
    setForm((f) => ({
      ...f,
      groupIds: f.groupIds.includes(id) ? f.groupIds.filter((g) => g !== id) : [...f.groupIds, id],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.phoneNumber.trim()) { setError("Mobile number is required."); return; }
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
        phoneNumber: form.phoneNumber.trim(),
        email: form.email || undefined,
        countryId: form.countryId ? Number(form.countryId) : undefined,
        languageCode: form.languageCode || undefined,
        groupIds: form.groupIds.length > 0 ? form.groupIds : undefined,
        whatsappOptOut: form.whatsappOptOut,
        disableBot: form.disableBot,
      };
      const hasCustom = Object.values(customFieldValues).some((v) => v.trim());
      if (hasCustom) {
        body["customFields"] = Object.fromEntries(
          Object.entries(customFieldValues).filter(([, v]) => v.trim())
        );
      }
      const res = await fetch(`${API_URL}/v1/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { data?: Contact; error?: { message: string } };
      if (!res.ok) { setError(json.error?.message ?? "Failed to create contact."); return; }
      onCreated(json.data!);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Add New Contact</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">First Name</label>
                <input
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="First name"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Last Name</label>
                <input
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Last name"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Country</label>
              <select
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={form.countryId}
                onChange={(e) => setForm((f) => ({ ...f, countryId: e.target.value }))}
              >
                <option value="">Select country</option>
                {countries.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <input
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="919876543210"
                value={form.phoneNumber}
                onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
              />
              <p className="text-xs text-gray-400">Number should be with country code without 0 or +</p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Language</label>
              <select
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={form.languageCode}
                onChange={(e) => setForm((f) => ({ ...f, languageCode: e.target.value }))}
              >
                <option value="">Select language</option>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="email@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            {groups.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Groups</label>
                <div ref={groupDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setGroupDropdownOpen((v) => !v)}
                    className="w-full min-h-[38px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
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
            )}

            <div className="space-y-3 pt-1">
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

            {customFields.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-gray-700">Other Information</p>
                {customFields.map((cf) => (
                  <div key={cf.id} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">
                      {cf.inputName}
                      {cf.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {cf.inputType === "boolean" ? (
                      <Toggle
                        checked={customFieldValues[cf.inputName] === "true"}
                        onChange={(v) =>
                          setCustomFieldValues((vals) => ({ ...vals, [cf.inputName]: v ? "true" : "false" }))
                        }
                        label=""
                      />
                    ) : cf.inputType === "select" ? (
                      <select
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
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
                        type={cf.inputType === "number" ? "number" : cf.inputType === "date" ? "date" : cf.inputType === "time" ? "time" : cf.inputType === "datetime-local" ? "datetime-local" : cf.inputType === "email" ? "email" : cf.inputType === "url" ? "url" : "text"}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
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
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
            <Button variant="secondary" type="button" onClick={onClose}>Close</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Submit"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/contacts/AddContactModal.tsx
git commit -m "refactor(web): strip AddContactModal to add-only, remove edit-mode dual logic"
```

---

## Task 5: Final verification

- [ ] **Step 1: Full type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 2: Build check**

```bash
pnpm --filter @WBMSG/web build
```

Expected: successful build, no TypeScript or import errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server:
```bash
pnpm --filter @WBMSG/web dev
```

Verify:
1. Contacts table shows — edit (pencil) button visible on every row
2. Click edit on a contact — right drawer slides in from the right
3. All fields pre-populated: name, email, country (correct country selected), language, lifecycle stage, tags, groups, toggles
4. Edit a field → Save Changes → drawer closes, table row updates, toast "Contact updated"
5. Click Add Contact — centered modal opens (not the drawer)
6. Create a contact → modal closes, contact appears in table, toast "Contact created"
7. Close drawer by clicking backdrop or Cancel — drawer slides out

- [ ] **Step 4: Push**

```bash
git push origin main
```
