"use client";

import { JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface GroupContact {
  contactId: string;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string;
    email: string | null;
  };
}

interface ContactGroup {
  id: string;
  title: string;
  description: string | null;
}

export default function GroupContactsPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();

  const { data: group } = useQuery<ContactGroup | null>({
    queryKey: ["contact-group", id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contact-groups`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return null;
      const all = (await res.json() as { data: ContactGroup[] }).data;
      return all.find((g) => g.id === id) ?? null;
    },
  });

  const { data: contacts = [], isLoading } = useQuery<GroupContact[]>({
    queryKey: ["contact-group-contacts", id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contact-groups/${id}/contacts`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: GroupContact[] }).data;
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <Link href="/contacts/groups" className="text-sm text-brand-600 hover:underline">
          ← Contact Groups
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">
          {group?.title ?? "Group Contacts"}
        </h1>
        {group?.description && (
          <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">
                  No contacts in this group yet.
                </td>
              </tr>
            ) : (
              contacts.map(({ contact }) => (
                <tr key={contact.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <Link href={`/contacts/${contact.id}`} className="hover:text-brand-600">
                      {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{contact.phoneNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{contact.email ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
