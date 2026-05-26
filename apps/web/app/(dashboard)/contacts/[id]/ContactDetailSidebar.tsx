"use client";

import { JSX, useState, useRef, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import {
  Toggle,
  SectionHeader,
  FieldSkeleton,
  LANGUAGES,
} from "@/components/contacts/contact-shared";
import { ContactLabelManager } from "@/components/contacts/ContactLabelManager";
import type { Contact } from "./ContactDetailClient";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

const LIFECYCLE_STAGES = ["lead", "prospect", "customer", "loyal", "churned"] as const;

interface Country { id: number; name: string }
interface OrgUser { id: string; email: string; fullName: string | null }
interface ContactGroup { id: string; title: string }
interface CustomField {
  id: string;
  inputName: string;
  inputType: string;
  description: string | null;
  placeholder: string | null;
  options: string[];
  isRequired: boolean;
  isReadOnly: boolean;
}

interface Props {
  contact: Contact;
  onUpdate: (partial: Partial<Contact>) => void;
}

export function ContactDetailSidebar({ contact, onUpdate }: Props): JSX.Element {
  const { getToken } = useAuth();

  // Local form state — initialised from contact prop
  const [firstName, setFirstName] = useState(contact.firstName ?? "");
  const [lastName, setLastName] = useState(contact.lastName ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [countryId, setCountryId] = useState(
    contact.countryId != null ? String(contact.countryId) : ""
  );
  const [languageCode, setLanguageCode] = useState(contact.languageCode ?? "");
  const [lifecycleStage, setLifecycleStage] = useState(contact.lifecycleStage);
  const [tags, setTags] = useState<string[]>(contact.tags);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [notesSaving, setNotesSaving] = useState(false);
  const [groupIds, setGroupIds] = useState<string[]>(contact.groupIds);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>(
    contact.customFields
      ? Object.fromEntries(
          Object.entries(contact.customFields).map(([k, v]) => [k, String(v)])
        )
      : {}
  );
  const [fieldError, setFieldError] = useState<string | null>(null);

  const groupDropdownRef = useRef<HTMLDivElement>(null);

  // Supporting data
  const { data: countries = [], isLoading: loadingCountries } = useQuery<Country[]>({
    queryKey: ["countries"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/v1/countries`);
      return res.ok ? (await res.json() as { data: Country[] }).data : [];
    },
    staleTime: Infinity,
  });

  const { data: users = [] } = useQuery<OrgUser[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/users`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      return res.ok ? (await res.json() as { data: OrgUser[] }).data : [];
    },
  });

  const { data: groups = [], isLoading: loadingGroups } = useQuery<ContactGroup[]>({
    queryKey: ["contact-groups", false],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contact-groups?archived=false`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      return res.ok ? (await res.json() as { data: ContactGroup[] }).data : [];
    },
  });

  const { data: customFields = [] } = useQuery<CustomField[]>({
    queryKey: ["custom-fields"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/custom-fields`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      return res.ok ? (await res.json() as { data: CustomField[] }).data : [];
    },
  });

  // Close group dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        groupDropdownRef.current &&
        !groupDropdownRef.current.contains(e.target as Node)
      ) {
        setGroupDropdownOpen(false);
      }
    }
    if (groupDropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [groupDropdownOpen]);

  async function patch(fields: Record<string, unknown>): Promise<void> {
    setFieldError(null);
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/contacts/${contact.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token ?? ""}`,
      },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      const json = await res.json() as { data: Partial<Contact> };
      onUpdate(json.data);
    } else {
      setFieldError("Failed to save. Please try again.");
    }
  }

  function addTag(value: string): void {
    const trimmed = value.toLowerCase().trim();
    if (trimmed && !tags.includes(trimmed)) {
      const updated = [...tags, trimmed];
      setTags(updated);
      void patch({ tags: updated });
    }
    setTagInput("");
  }

  function removeTag(tag: string): void {
    const updated = tags.filter((t) => t !== tag);
    setTags(updated);
    void patch({ tags: updated });
  }

  function toggleGroup(id: string): void {
    const updated = groupIds.includes(id)
      ? groupIds.filter((g) => g !== id)
      : [...groupIds, id];
    setGroupIds(updated);
    // PATCH returns contact without groupIds — update local state directly
    void patch({ groupIds: updated }).then(() => onUpdate({ groupIds: updated }));
  }

  async function saveNotes(): Promise<void> {
    setNotesSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/${contact.id}/notes`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        onUpdate({ notes });
      } else {
        setFieldError("Failed to save notes. Please try again.");
      }
    } catch {
      setFieldError("Failed to save notes. Please try again.");
    } finally {
      setNotesSaving(false);
    }
  }

  async function updateAssignee(userId: string): Promise<void> {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/${contact.id}/assign`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({ userId: userId || null }),
      });
      if (res.ok) {
        onUpdate({ assignedUserId: userId || null });
      } else {
        setFieldError("Failed to update assignee. Please try again.");
      }
    } catch {
      setFieldError("Failed to update assignee. Please try again.");
    }
  }

  const inputCls =
    "rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors w-full";

  return (
    <div className="space-y-0">
      {/* ── Identity ─────────────────────────────────────────── */}
      <SectionHeader title="Identity" />
      <div className="space-y-3 pb-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">First Name</label>
            <input
              className={inputCls}
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onBlur={() => { void patch({ firstName: firstName || undefined }); }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Last Name</label>
            <input
              className={inputCls}
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onBlur={() => { void patch({ lastName: lastName || undefined }); }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Phone</label>
          <input
            className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500 font-mono cursor-not-allowed w-full"
            value={contact.phoneNumber}
            disabled
            readOnly
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Email</label>
          <input
            type="email"
            className={inputCls}
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => { void patch({ email: email || undefined }); }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Country</label>
            {loadingCountries ? (
              <FieldSkeleton />
            ) : (
              <select
                className={inputCls}
                value={countryId}
                onChange={(e) => {
                  setCountryId(e.target.value);
                  void patch({
                    countryId: e.target.value ? Number(e.target.value) : undefined,
                  });
                }}
              >
                <option value="">Select country</option>
                {countries.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Language</label>
            <select
              className={inputCls}
              value={languageCode}
              onChange={(e) => {
                setLanguageCode(e.target.value);
                void patch({ languageCode: e.target.value || undefined });
              }}
            >
              <option value="">Select language</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Lifecycle & Tags ─────────────────────────────────── */}
      <SectionHeader title="Lifecycle & Tags" />
      <div className="space-y-3 pb-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Stage</label>
          <select
            className={inputCls}
            value={lifecycleStage}
            onChange={(e) => {
              setLifecycleStage(e.target.value);
              void patch({ lifecycleStage: e.target.value });
            }}
          >
            {LIFECYCLE_STAGES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Tags</label>
          <div className="min-h-[38px] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex flex-wrap gap-1.5 items-center focus-within:ring-2 focus-within:ring-brand-500 transition-colors cursor-text">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 bg-gray-200 text-gray-700 rounded-full text-xs px-2 py-0.5 shrink-0"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-red-500 leading-none ml-0.5"
                >
                  &times;
                </button>
              </span>
            ))}
            <input
              className="flex-1 min-w-[80px] text-sm bg-transparent outline-none placeholder-gray-400"
              placeholder={tags.length === 0 ? "Add tag…" : ""}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                }
                if (e.key === "Backspace" && !tagInput && tags.length > 0) {
                  removeTag(tags[tags.length - 1]!);
                }
              }}
              onBlur={() => {
                if (tagInput.trim()) addTag(tagInput);
              }}
            />
          </div>
          <p className="text-xs text-gray-400">Press Enter or comma to add a tag</p>
        </div>
      </div>

      {/* ── Labels ───────────────────────────────────────────── */}
      <SectionHeader title="Labels" />
      <div className="pb-3">
        <ContactLabelManager contactId={contact.id} />
      </div>

      {/* ── Notes ────────────────────────────────────────────── */}
      <SectionHeader title="Notes" />
      <div className="space-y-2 pb-3">
        <textarea
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors resize-none"
          rows={3}
          placeholder="Add notes about this contact…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button
          type="button"
          onClick={() => { void saveNotes(); }}
          disabled={notesSaving}
          className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          {notesSaving ? "Saving…" : "Save notes"}
        </button>
      </div>

      {/* ── Assignee ─────────────────────────────────────────── */}
      <SectionHeader title="Assignee" />
      <div className="pb-3">
        <select
          className={inputCls}
          value={contact.assignedUserId ?? ""}
          onChange={(e) => { void updateAssignee(e.target.value); }}
        >
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName ?? u.email}
            </option>
          ))}
        </select>
      </div>

      {/* ── Settings ─────────────────────────────────────────── */}
      <SectionHeader title="Settings" />
      <div className="space-y-3 pb-3">
        <Toggle
          checked={!contact.disableBot}
          onChange={(v) => { void patch({ disableBot: !v }); }}
          label="Enable Reply Bot"
        />
        <Toggle
          checked={contact.whatsappOptOut}
          onChange={(v) => { void patch({ whatsappOptOut: v }); }}
          label="Opt out Marketing Messages"
        />
      </div>

      {/* ── Groups ───────────────────────────────────────────── */}
      {(groups.length > 0 || loadingGroups) && (
        <>
          <SectionHeader title="Groups" />
          <div className="pb-3">
            {loadingGroups ? (
              <FieldSkeleton />
            ) : (
              <div ref={groupDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setGroupDropdownOpen((v) => !v)}
                  className="w-full min-h-[38px] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                >
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {groupIds.length === 0 ? (
                      <span className="text-gray-400">Select groups…</span>
                    ) : (
                      groupIds.map((id) => {
                        const g = groups.find((gr) => gr.id === id);
                        return g ? (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 border border-brand-200 rounded-full text-xs px-2 py-0.5"
                          >
                            {g.title}
                            <span
                              role="button"
                              aria-label={`Remove ${g.title}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGroup(id);
                              }}
                              className="hover:text-brand-900 cursor-pointer leading-none"
                            >
                              &times;
                            </span>
                          </span>
                        ) : null;
                      })
                    )}
                  </div>
                  <span
                    className={`text-gray-400 shrink-0 transition-transform ${
                      groupDropdownOpen ? "rotate-180" : ""
                    }`}
                  >
                    ▾
                  </span>
                </button>

                {groupDropdownOpen && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {groups.map((g) => {
                      const selected = groupIds.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleGroup(g.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-sm text-left"
                        >
                          <span
                            className={[
                              "w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors",
                              selected
                                ? "bg-brand-600 border-brand-600"
                                : "border-gray-300",
                            ].join(" ")}
                          >
                            {selected && (
                              <span className="text-white text-[10px] leading-none">
                                ✓
                              </span>
                            )}
                          </span>
                          <span className="text-gray-700">{g.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Custom Fields ────────────────────────────────────── */}
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
                    onChange={(v) => {
                      const updated = {
                        ...customFieldValues,
                        [cf.inputName]: v ? "true" : "false",
                      };
                      setCustomFieldValues(updated);
                      void patch({ customFields: updated });
                    }}
                  />
                ) : cf.inputType === "select" ? (
                  <select
                    className={inputCls}
                    value={customFieldValues[cf.inputName] ?? ""}
                    disabled={cf.isReadOnly}
                    onChange={(e) => {
                      const updated = {
                        ...customFieldValues,
                        [cf.inputName]: e.target.value,
                      };
                      setCustomFieldValues(updated);
                      void patch({ customFields: updated });
                    }}
                  >
                    <option value="">Select…</option>
                    {cf.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      ["number", "date", "time", "email", "url"].includes(cf.inputType)
                        ? cf.inputType
                        : "text"
                    }
                    className={inputCls}
                    placeholder={cf.placeholder ?? cf.inputName}
                    value={customFieldValues[cf.inputName] ?? ""}
                    disabled={cf.isReadOnly}
                    onChange={(e) =>
                      setCustomFieldValues((v) => ({
                        ...v,
                        [cf.inputName]: e.target.value,
                      }))
                    }
                    onBlur={() => {
                      void patch({ customFields: customFieldValues });
                    }}
                  />
                )}

                {cf.description && (
                  <p className="text-xs text-gray-400">{cf.description}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {fieldError && <p className="text-xs text-red-500 mt-2">{fieldError}</p>}
    </div>
  );
}
