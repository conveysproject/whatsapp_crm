"use client";

import { JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import {
  SectionHeader,
  FieldSkeleton,
  LANGUAGES,
} from "@/components/contacts/contact-shared";
import { ContactLabelManager } from "@/components/contacts/ContactLabelManager";
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
}

export function ContactDetailSidebar({ contact }: Props): JSX.Element {
  const { getToken } = useAuth();

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

  const countryName = countries.find((c) => c.id === contact.countryId)?.name ?? null;
  const languageLabel = LANGUAGES.find((l) => l.code === contact.languageCode)?.label ?? null;
  const assignee = users.find((u) => u.id === contact.assignedUserId);
  const assigneeName = assignee ? (assignee.fullName ?? assignee.email) : null;
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
          <span className="text-sm font-mono text-gray-900">{contact.phoneNumber}</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelCls}>Email</span>
          {contact.email ? (
            <span className={valueCls}>{contact.email}</span>
          ) : emptyDash}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Country</span>
            {loadingCountries ? (
              <FieldSkeleton />
            ) : countryName ? (
              <span className={valueCls}>{countryName}</span>
            ) : emptyDash}
          </div>
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Language</span>
            {languageLabel ? (
              <span className={valueCls}>{languageLabel}</span>
            ) : emptyDash}
          </div>
        </div>
      </div>

      {/* ── Lifecycle & Tags ─────────────────────────────────── */}
      <SectionHeader title="Lifecycle & Tags" />
      <div className="space-y-3 pb-3">
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Stage</span>
          <div>
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
              {contact.lifecycleStage.charAt(0).toUpperCase() + contact.lifecycleStage.slice(1)}
            </span>
          </div>
        </div>

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
      </div>

      {/* ── Labels ───────────────────────────────────────────── */}
      <SectionHeader title="Labels" />
      <div className="pb-3">
        <ContactLabelManager contactId={contact.id} />
      </div>

      {/* ── Notes ────────────────────────────────────────────── */}
      <SectionHeader title="Notes" />
      <div className="pb-3">
        {contact.notes ? (
          <p className="text-sm text-gray-900 whitespace-pre-wrap">{contact.notes}</p>
        ) : (
          <p className="text-sm text-gray-400">No notes</p>
        )}
      </div>

      {/* ── Assignee ─────────────────────────────────────────── */}
      <SectionHeader title="Assignee" />
      <div className="pb-3">
        {loadingUsers ? (
          <FieldSkeleton />
        ) : assigneeName ? (
          <span className={valueCls}>{assigneeName}</span>
        ) : (
          <span className="text-sm text-gray-400">Unassigned</span>
        )}
      </div>

      {/* ── Settings ─────────────────────────────────────────── */}
      <SectionHeader title="Settings" />
      <div className="space-y-2 pb-3">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Reply Bot</span>
          <span className={`text-sm font-medium ${!contact.disableBot ? "text-green-600" : "text-gray-400"}`}>
            {!contact.disableBot ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className={labelCls}>Marketing Messages</span>
          <span className={`text-sm font-medium ${contact.whatsappOptOut ? "text-red-500" : "text-green-600"}`}>
            {contact.whatsappOptOut ? "Opted out" : "Active"}
          </span>
        </div>
      </div>

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
    </div>
  );
}
