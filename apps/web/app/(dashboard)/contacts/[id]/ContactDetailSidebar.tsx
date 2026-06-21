"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import {
  SectionHeader,
  FieldSkeleton,
  LANGUAGES,
} from "@/components/contacts/contact-shared";
import { ContactDeals } from "@/components/deals/ContactDeals";
import type { Contact } from "./ContactDetailClient";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

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
  onAssigned?: (userId: string | null) => void;
}

export function ContactDetailSidebar({ contact, onAssigned }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [assignedId, setAssignedId] = useState<string | null>(contact.assignedUserId);
  const [assigning, setAssigning] = useState(false);

  const { data: countries = [], isLoading: loadingCountries } = useQuery<Country[]>({
    queryKey: ["countries"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/v1/countries`);
      return res.ok ? (await res.json() as { data: Country[] }).data : [];
    },
    staleTime: Infinity,
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery<OrgUser[]>({
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

  const { data: customFields = [], isLoading: loadingCustomFields } = useQuery<CustomField[]>({
    queryKey: ["custom-fields"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/custom-fields`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      return res.ok ? (await res.json() as { data: CustomField[] }).data : [];
    },
  });

  const { data: trustData, isLoading: loadingTrust } = useQuery<{ score: number; label: string } | null>({
    queryKey: ["contact-trust-score", contact.id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/${contact.id}/trust-score`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      return res.ok ? (await res.json() as { data: { score: number; label: string } }).data : null;
    },
    staleTime: 5 * 60 * 1000,
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
    staleTime: 30_000,
  });

  function isVisible(key: string): boolean { return !hiddenFields.includes(key); }

  const countryName = countries.find((c) => c.id === contact.countryId)?.name ?? null;
  const languageLabel = LANGUAGES.find((l) => l.code === contact.languageCode)?.label ?? null;
  const assignee = users.find((u) => u.id === assignedId);
  const assigneeName = assignee ? (assignee.fullName ?? assignee.email) : null;

  async function handleAssign(userId: string | null): Promise<void> {
    setAssigning(true);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/contacts/${contact.id}/assign`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      setAssignedId(userId);
      onAssigned?.(userId);
    } finally {
      setAssigning(false);
    }
  }
  const contactGroupNames = contact.groupIds
    .map((id) => groups.find((g) => g.id === id)?.title)
    .filter((t): t is string => t !== undefined);

  const labelCls = "text-xs font-medium text-gray-500";
  const valueCls = "text-sm text-gray-900";
  const emptyDash = <span className="text-sm text-gray-400">—</span>;

  return (
    <div className="space-y-0">
      {/* ── Identity ─────────────────────────────────────────── */}
      <SectionHeader title="Identity" />
      <div className="space-y-3 pb-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className={labelCls}>First Name</span>
            {contact.firstName ? (
              <span className={valueCls}>{contact.firstName}</span>
            ) : emptyDash}
          </div>
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Last Name</span>
            {contact.lastName ? (
              <span className={valueCls}>{contact.lastName}</span>
            ) : emptyDash}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelCls}>Phone</span>
          <span className="text-sm font-mono text-gray-900">+{contact.phoneNumber}</span>
        </div>

        {isVisible("email") && (
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Email</span>
            {contact.email ? (
              <span className={valueCls}>{contact.email}</span>
            ) : emptyDash}
          </div>
        )}

        {(isVisible("country_code") || isVisible("language_code")) && (
          <div className="grid grid-cols-2 gap-3">
            {isVisible("country_code") && (
              <div className="flex flex-col gap-1">
                <span className={labelCls}>Country</span>
                {loadingCountries ? (
                  <FieldSkeleton />
                ) : countryName ? (
                  <span className={valueCls}>{countryName}</span>
                ) : emptyDash}
              </div>
            )}
            {isVisible("language_code") && (
              <div className="flex flex-col gap-1">
                <span className={labelCls}>Language</span>
                {languageLabel ? (
                  <span className={valueCls}>{languageLabel}</span>
                ) : emptyDash}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Status & Tags ────────────────────────────────────── */}
      <SectionHeader title="Status & Tags" />
      <div className="space-y-3 pb-3">
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Status</span>
          <div>
            {contact.leadStatus ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: contact.leadStatus.color }}
                />
                {contact.leadStatus.name}
              </span>
            ) : emptyDash}
          </div>
        </div>

        {isVisible("tags") && (
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Tags</span>
            {contact.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center bg-gray-200 text-gray-700 rounded-full text-xs px-2 py-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : emptyDash}
          </div>
        )}
      </div>

      {/* ── Notes ────────────────────────────────────────────── */}
      {isVisible("notes") && <SectionHeader title="Notes" />}
      {isVisible("notes") && (
        <div className="pb-3">
          {contact.notes ? (
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{contact.notes}</p>
          ) : (
            <p className="text-sm text-gray-400">No notes</p>
          )}
        </div>
      )}

      {/* ── Assignee ─────────────────────────────────────────── */}
      {isVisible("assigned_user_id") && <SectionHeader title="Assignee" />}
      {isVisible("assigned_user_id") && (
        <div className="pb-3">
          {loadingUsers ? (
            <FieldSkeleton />
          ) : (
            <select
              value={assignedId ?? ""}
              onChange={(e) => { void handleAssign(e.target.value || null); }}
              disabled={assigning}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            >
              <option value="">— Unassigned —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName ?? u.email}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ── Settings ─────────────────────────────────────────── */}
      {(isVisible("disable_bot") || isVisible("whatsapp_opt_out")) && <SectionHeader title="Settings" />}
      {(isVisible("disable_bot") || isVisible("whatsapp_opt_out")) && (
        <div className="space-y-2 pb-3">
          {isVisible("disable_bot") && (
            <div className="flex items-center justify-between">
              <span className={labelCls}>Reply Bot</span>
              <span className={`text-sm font-medium ${!contact.disableBot ? "text-green-600" : "text-gray-400"}`}>
                {!contact.disableBot ? "Enabled" : "Disabled"}
              </span>
            </div>
          )}
          {isVisible("whatsapp_opt_out") && (
            <div className="flex items-center justify-between">
              <span className={labelCls}>Marketing Messages</span>
              <span className={`text-sm font-medium ${contact.whatsappOptOut ? "text-red-500" : "text-green-600"}`}>
                {contact.whatsappOptOut ? "Opted out" : "Active"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Groups ───────────────────────────────────────────── */}
      <SectionHeader title="Groups" />
      <div className="pb-3">
        {loadingGroups ? (
          <FieldSkeleton />
        ) : contactGroupNames.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {contactGroupNames.map((title) => (
              <span
                key={title}
                className="inline-flex items-center bg-brand-50 text-brand-700 border border-brand-200 rounded-full text-xs px-2 py-0.5"
              >
                {title}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm text-gray-400">None</span>
        )}
      </div>

      {/* ── Custom Fields ────────────────────────────────────── */}
      {!loadingCustomFields && customFields.length > 0 && (
        <>
          <SectionHeader title="Custom Fields" />
          <div className="space-y-3 pb-3">
            {customFields.map((cf) => {
              const rawValue = contact.customFields?.[cf.inputName] ?? null;
              let displayValue: string | null = null;
              if (rawValue !== null && rawValue !== "") {
                displayValue = cf.inputType === "boolean"
                  ? (rawValue === "true" ? "Yes" : "No")
                  : rawValue;
              }
              return (
                <div key={cf.id} className="flex flex-col gap-1">
                  <span className={labelCls}>{cf.inputName}</span>
                  {displayValue !== null ? (
                    <span className={valueCls}>{displayValue}</span>
                  ) : emptyDash}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Trust Score ──────────────────────────────────────── */}
      <SectionHeader title="Trust Score" />
      <div className="pb-4">
        {loadingTrust ? (
          <FieldSkeleton />
        ) : trustData ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className={`text-3xl font-bold tabular-nums ${
                trustData.score >= 80 ? "text-green-600" :
                trustData.score >= 50 ? "text-yellow-500" : "text-red-500"
              }`}>
                {trustData.score}
              </span>
              <span className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold ${
                trustData.label === "high"     ? "bg-green-50 text-green-700" :
                trustData.label === "medium"   ? "bg-yellow-50 text-yellow-700" :
                                                "bg-red-50 text-red-700"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  trustData.label === "high"   ? "bg-green-500" :
                  trustData.label === "medium" ? "bg-yellow-400" : "bg-red-500"
                }`} />
                {trustData.label === "very_low"
                  ? "Very Low"
                  : trustData.label.charAt(0).toUpperCase() + trustData.label.slice(1)}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Status: {contact.leadStatus?.name ?? "—"}
            </p>
          </div>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </div>

      {/* ── Deals ────────────────────────────────────────────── */}
      <ContactDeals contactId={contact.id} />
    </div>
  );
}
