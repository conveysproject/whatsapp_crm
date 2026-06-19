"use client";

import { JSX, useState, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { ContactDetailHeader } from "./ContactDetailHeader";
import { ContactDetailSidebar } from "./ContactDetailSidebar";
import { ContactDetailPanel } from "./ContactDetailPanel";
import { EditContactDrawer } from "@/components/contacts/EditContactDrawer";
import type { Contact as DrawerContact, EditableContact } from "@/components/contacts/AddContactModal";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface Contact {
  id: string;
  phoneNumber: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  lifecycleStage: string;
  tags: string[];
  notes: string | null;
  assignedUserId: string | null;
  waBlockedAt: string | null;
  disableBot: boolean;
  whatsappOptOut: boolean;
  languageCode: string | null;
  countryId: number | null;
  pastAiSummary: string | null;
  groupIds: string[];
  customFields: Record<string, string> | null;
}

export function ContactDetailClient({ contact: initial }: { contact: Contact }): JSX.Element {
  const [contact, setContact] = useState<Contact>(initial);
  const [showEdit, setShowEdit] = useState(false);
  const { getToken } = useAuth();

  function handleBlockChange(waBlockedAt: string | null): void {
    setContact((prev) => ({ ...prev, waBlockedAt }));
  }

  async function handleDrawerUpdated(): Promise<void> {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/${contact.id}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) {
        const json = await res.json() as { data: Contact };
        setContact(json.data);
      }
    } finally {
      setShowEdit(false);
    }
  }

  const editableContact = useMemo<EditableContact>(() => ({
    id: contact.id,
    name: contact.name,
    firstName: contact.firstName,
    lastName: contact.lastName,
    phoneNumber: contact.phoneNumber,
    email: contact.email,
    countryId: contact.countryId,
    languageCode: contact.languageCode,
    tags: contact.tags,
    whatsappOptOut: contact.whatsappOptOut,
    disableBot: contact.disableBot,
    groupIds: contact.groupIds,
    customFields: contact.customFields,
  }), [contact]);

  return (
    <div className="flex flex-col h-full">
      <ContactDetailHeader
        contact={contact}
        onBlockChange={handleBlockChange}
        onEdit={() => setShowEdit(true)}
      />
      <div className="flex flex-1 min-h-0">
        <aside className="w-80 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
          <div className="p-4">
            <ContactDetailSidebar contact={contact} />
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <ContactDetailPanel
            contactId={contact.id}
            contactName={[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phoneNumber}
            initialSummary={contact.pastAiSummary}
          />
        </main>
      </div>
      <EditContactDrawer
        open={showEdit}
        contact={editableContact}
        onClose={() => setShowEdit(false)}
        onUpdated={handleDrawerUpdated as (c: DrawerContact) => void}
      />
    </div>
  );
}
