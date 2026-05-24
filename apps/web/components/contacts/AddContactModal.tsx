"use client";

import { JSX, FormEvent, useState, useEffect } from "react";
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

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (contact: Contact) => void;
}

interface Country { id: number; name: string; isoCode: string | null; phoneCode: number | null }
interface ContactGroup { id: string; title: string }
interface CustomField { id: string; inputName: string; inputType: string }

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
  const [showOtherInfo, setShowOtherInfo] = useState(false);
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
      setShowOtherInfo(false);
      setError(null);
    }
  }, [open]);

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
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Mobile Number <span className="text-red-500">*</span></label>
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
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      className={[
                        "text-xs px-3 py-1.5 rounded-full border transition-colors",
                        form.groupIds.includes(g.id)
                          ? "bg-brand-600 text-white border-brand-600"
                          : "border-gray-300 text-gray-600 hover:border-brand-400",
                      ].join(" ")}
                    >
                      {g.title}
                    </button>
                  ))}
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
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowOtherInfo((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span>Other Information</span>
                  <span className={`text-gray-400 transition-transform ${showOtherInfo ? "rotate-180" : ""}`}>▾</span>
                </button>
                {showOtherInfo && (
                  <div className="px-4 py-3 space-y-3">
                    {customFields.map((cf) => (
                      <div key={cf.id} className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-600">{cf.inputName}</label>
                        <input
                          type={cf.inputType === "number" ? "number" : cf.inputType === "date" ? "date" : "text"}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          placeholder={cf.inputName}
                          value={customFieldValues[cf.inputName] ?? ""}
                          onChange={(e) => setCustomFieldValues((v) => ({ ...v, [cf.inputName]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
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
