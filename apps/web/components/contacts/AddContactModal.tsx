"use client";

import { JSX, FormEvent, useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { useLeadStatuses } from "@/hooks/useLeadStatuses";

export interface Contact {
  id: string;
  phoneNumber: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  leadStatusId?: string;
  languageCode: string | null;
  createdAt: string;
  whatsappOptOut: boolean;
  country: { name: string } | null;
  groupContacts?: { contactGroup: { id: string; title: string } }[];
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
  leadStatusId?: string;
  tags: string[];
  whatsappOptOut: boolean;
  disableBot: boolean;
  groupIds: string[];
  customFields?: Record<string, string> | null;
  assignedUserId?: string | null;
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
  { code: "af",    label: "Afrikaans (af)" },
  { code: "sq",    label: "Albanian (sq)" },
  { code: "ar",    label: "Arabic (ar)" },
  { code: "az",    label: "Azerbaijani (az)" },
  { code: "bn",    label: "Bengali (bn)" },
  { code: "bg",    label: "Bulgarian (bg)" },
  { code: "ca",    label: "Catalan (ca)" },
  { code: "zh_CN", label: "Chinese (Simplified) (zh_CN)" },
  { code: "zh_HK", label: "Chinese (Traditional - Hong Kong) (zh_HK)" },
  { code: "zh_TW", label: "Chinese (Traditional - Taiwan) (zh_TW)" },
  { code: "hr",    label: "Croatian (hr)" },
  { code: "cs",    label: "Czech (cs)" },
  { code: "da",    label: "Danish (da)" },
  { code: "nl",    label: "Dutch (nl)" },
  { code: "en",    label: "English (en)" },
  { code: "en_GB", label: "English (UK) (en_GB)" },
  { code: "en_US", label: "English (US) (en_US)" },
  { code: "et",    label: "Estonian (et)" },
  { code: "fil",   label: "Filipino (fil)" },
  { code: "fi",    label: "Finnish (fi)" },
  { code: "fr",    label: "French (fr)" },
  { code: "ka",    label: "Georgian (ka)" },
  { code: "de",    label: "German (de)" },
  { code: "el",    label: "Greek (el)" },
  { code: "gu",    label: "Gujarati (gu)" },
  { code: "he",    label: "Hebrew (he)" },
  { code: "hi",    label: "Hindi (hi)" },
  { code: "hu",    label: "Hungarian (hu)" },
  { code: "id",    label: "Indonesian (id)" },
  { code: "ga",    label: "Irish (ga)" },
  { code: "it",    label: "Italian (it)" },
  { code: "ja",    label: "Japanese (ja)" },
  { code: "kn",    label: "Kannada (kn)" },
  { code: "kk",    label: "Kazakh (kk)" },
  { code: "ko",    label: "Korean (ko)" },
  { code: "ky",    label: "Kyrgyz (ky)" },
  { code: "lo",    label: "Lao (lo)" },
  { code: "lv",    label: "Latvian (lv)" },
  { code: "lt",    label: "Lithuanian (lt)" },
  { code: "mk",    label: "Macedonian (mk)" },
  { code: "ms",    label: "Malay (ms)" },
  { code: "ml",    label: "Malayalam (ml)" },
  { code: "mr",    label: "Marathi (mr)" },
  { code: "nb",    label: "Norwegian (nb)" },
  { code: "fa",    label: "Persian (fa)" },
  { code: "pl",    label: "Polish (pl)" },
  { code: "pt_BR", label: "Portuguese (Brazil) (pt_BR)" },
  { code: "pt_PT", label: "Portuguese (Portugal) (pt_PT)" },
  { code: "pa",    label: "Punjabi (pa)" },
  { code: "ro",    label: "Romanian (ro)" },
  { code: "ru",    label: "Russian (ru)" },
  { code: "sr",    label: "Serbian (sr)" },
  { code: "sk",    label: "Slovak (sk)" },
  { code: "sl",    label: "Slovenian (sl)" },
  { code: "es",    label: "Spanish (es)" },
  { code: "es_MX", label: "Spanish (Mexico) (es_MX)" },
  { code: "sw",    label: "Swahili (sw)" },
  { code: "sv",    label: "Swedish (sv)" },
  { code: "ta",    label: "Tamil (ta)" },
  { code: "te",    label: "Telugu (te)" },
  { code: "th",    label: "Thai (th)" },
  { code: "tr",    label: "Turkish (tr)" },
  { code: "uk",    label: "Ukrainian (uk)" },
  { code: "ur",    label: "Urdu (ur)" },
  { code: "uz",    label: "Uzbek (uz)" },
  { code: "vi",    label: "Vietnamese (vi)" },
  { code: "zu",    label: "Zulu (zu)" },
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

export function AddContactModal({ open, onClose, onCreated }: Props): JSX.Element {
  const { getToken } = useAuth();
  const { data: leadStatuses } = useLeadStatuses();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    email: "",
    countryId: "",
    languageCode: "",
    leadStatusId: "",
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
    enabled: open,
    staleTime: 30_000,
  });

  function isVisible(key: string): boolean {
    return !hiddenFields.includes(key);
  }

  useEffect(() => {
    if (!open) {
      setForm({ firstName: "", lastName: "", phoneNumber: "", email: "", countryId: "", languageCode: "", leadStatusId: "", groupIds: [], whatsappOptOut: false, disableBot: false });
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
    const invalidFormat = customFields.filter((cf) => {
      const val = customFieldValues[cf.inputName]?.trim();
      if (!val) return false;
      if (cf.inputType === "email") return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
      if (cf.inputType === "url") { try { new URL(val); return false; } catch { return true; } }
      if (cf.inputType === "number") return isNaN(Number(val));
      return false;
    });
    if (invalidFormat.length > 0) {
      setError(`Invalid format: ${invalidFormat.map((f) => f.inputName).join(", ")}`);
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
        leadStatusId: form.leadStatusId || undefined,
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
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div className={`fixed inset-y-0 right-0 z-50 w-[480px] max-w-full bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Add New Contact</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form noValidate onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col flex-1 overflow-hidden">
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

            {isVisible("country_code") && (
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
            )}

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

            {isVisible("language_code") && (
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
            )}

            {isVisible("email") && (
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
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Status</label>
              <select
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors"
                value={form.leadStatusId}
                onChange={(e) => setForm((f) => ({ ...f, leadStatusId: e.target.value }))}
              >
                <option value="">— Select status —</option>
                {leadStatuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
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

            {(isVisible("whatsapp_opt_out") || isVisible("disable_bot")) && (
              <div className="space-y-3 pt-1">
                {isVisible("whatsapp_opt_out") && (
                  <Toggle
                    checked={form.whatsappOptOut}
                    onChange={(v) => setForm((f) => ({ ...f, whatsappOptOut: v }))}
                    label="Opt out Marketing Messages"
                  />
                )}
                {isVisible("disable_bot") && (
                  <Toggle
                    checked={!form.disableBot}
                    onChange={(v) => setForm((f) => ({ ...f, disableBot: !v }))}
                    label="Enable Reply Bot"
                  />
                )}
              </div>
            )}

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
    </>
  );
}
