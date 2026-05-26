"use client";

import { JSX, useState } from "react";
import { ContactDetailHeader } from "./ContactDetailHeader";
import { ContactDetailSidebar } from "./ContactDetailSidebar";
import { ContactDetailPanel } from "./ContactDetailPanel";
import { EditContactDrawer } from "@/components/contacts/EditContactDrawer";
import type { Contact as DrawerContact, EditableContact } from "@/components/contacts/AddContactModal";

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

  function handleBlockChange(waBlockedAt: string | null): void {
    setContact((prev) => ({ ...prev, waBlockedAt }));
  }

  function handleDrawerUpdated(updated: DrawerContact): void {
    setContact((prev) => ({
      ...prev,
      firstName: updated.firstName,
      lastName: updated.lastName,
      name: updated.name,
      email: updated.email,
      lifecycleStage: updated.lifecycleStage,
      languageCode: updated.languageCode,
      whatsappOptOut: updated.whatsappOptOut,
      groupIds: updated.groupContacts?.map((gc) => gc.contactGroup.id) ?? prev.groupIds,
    }));
    setShowEdit(false);
  }

  const editableContact: EditableContact = {
    id: contact.id,
    name: contact.name,
    firstName: contact.firstName,
    lastName: contact.lastName,
    phoneNumber: contact.phoneNumber,
    email: contact.email,
    countryId: contact.countryId,
    languageCode: contact.languageCode,
    lifecycleStage: contact.lifecycleStage,
    tags: contact.tags,
    whatsappOptOut: contact.whatsappOptOut,
    disableBot: contact.disableBot,
    groupIds: contact.groupIds,
    customFields: contact.customFields,
  };

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
          <ContactDetailPanel contactId={contact.id} initialSummary={contact.pastAiSummary} />
        </main>
      </div>
      <EditContactDrawer
        open={showEdit}
        contact={editableContact}
        onClose={() => setShowEdit(false)}
        onUpdated={handleDrawerUpdated}
      />
    </div>
  );
}
