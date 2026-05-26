// apps/web/app/(dashboard)/contacts/[id]/ContactDetailHeader.tsx
"use client";

import { JSX, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { SendTemplateModal } from "@/components/contacts/SendTemplateModal";
import { ContactChatDrawer } from "@/components/contacts/ContactChatDrawer";
import type { Contact } from "./ContactDetailClient";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

const AVATAR_PALETTE = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
];

function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]!;
}

interface Props {
  contact: Pick<Contact, "id" | "phoneNumber" | "firstName" | "lastName" | "name" | "waBlockedAt">;
  onBlockChange: (waBlockedAt: string | null) => void;
}

export function ContactDetailHeader({ contact, onBlockChange }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [showTemplate, setShowTemplate] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [blocking, setBlocking] = useState(false);

  const displayName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    contact.name ||
    contact.phoneNumber;

  const initials =
    [(contact.firstName ?? "")[0], (contact.lastName ?? "")[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || contact.phoneNumber.slice(-2);

  const colorClass = avatarColor(contact.firstName ?? contact.phoneNumber);
  const isBlocked = contact.waBlockedAt !== null;

  async function toggleBlock(): Promise<void> {
    setBlocking(true);
    const token = await getToken();
    const endpoint = isBlocked ? "unblock" : "block";
    const res = await fetch(`${API_URL}/v1/contacts/${contact.id}/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    if (res.ok) {
      onBlockChange(isBlocked ? null : new Date().toISOString());
    }
    setBlocking(false);
  }

  return (
    <div className="flex items-center gap-4 bg-white border-b border-gray-200 px-6 py-4 shrink-0">
      <Link href="/contacts" className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 text-lg leading-none">
        ←
      </Link>

      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${colorClass}`}>
        {initials}
      </div>

      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-gray-900 truncate">{displayName}</h1>
        <p className="text-xs text-gray-400 font-mono mt-0.5">{contact.phoneNumber}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setShowTemplate(true)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Send Template
        </button>
        <button
          type="button"
          onClick={() => setShowChat(true)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Open Chat
        </button>
        <button
          type="button"
          onClick={() => { void toggleBlock(); }}
          disabled={blocking}
          className={[
            "px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-50",
            isBlocked
              ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
              : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
          ].join(" ")}
        >
          {blocking ? "…" : isBlocked ? "Unblock" : "Block"}
        </button>
      </div>

      {showTemplate && (
        <SendTemplateModal
          contactId={contact.id}
          onClose={() => setShowTemplate(false)}
          onSent={() => setShowTemplate(false)}
        />
      )}
      {showChat && (
        <ContactChatDrawer
          contactId={contact.id}
          contactName={displayName}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
}
