"use client";

import { JSX, useState } from "react";
import { ContactDetailHeader } from "./ContactDetailHeader";
import { ContactDetailSidebar } from "./ContactDetailSidebar";
import { ContactDetailPanel } from "./ContactDetailPanel";

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

  function handleUpdate(partial: Partial<Contact>): void {
    setContact((prev) => ({ ...prev, ...partial }));
  }

  return (
    <div className="flex flex-col h-full">
      <ContactDetailHeader
        contact={contact}
        onBlockChange={(waBlockedAt) => handleUpdate({ waBlockedAt })}
      />
      <div className="flex flex-1 min-h-0">
        <aside className="w-80 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
          <div className="p-4">
            <ContactDetailSidebar contact={contact} onUpdate={handleUpdate} />
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <ContactDetailPanel contactId={contact.id} initialSummary={contact.pastAiSummary} />
        </main>
      </div>
    </div>
  );
}
