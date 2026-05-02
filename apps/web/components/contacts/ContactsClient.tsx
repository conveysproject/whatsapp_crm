"use client";

import { JSX, useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toast, useToast } from "@/components/ui/Toast";
import { AddContactModal, type Contact } from "./AddContactModal";

const stageVariant: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = {
  customer: "green",
  prospect: "blue",
  lead:     "yellow",
  churned:  "red",
  loyal:    "green",
};

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Props {
  initialContacts: Contact[];
}

export function ContactsClient({ initialContacts }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const { toast, toastState, setToastOpen } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    const token = await getToken();
    if (!token) return;
    setSearching(true);
    try {
      const res = await fetch(
        `${API_URL}/v1/contacts/search?q=${encodeURIComponent(q)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const json = await res.json() as { data: Contact[] };
        setContacts(json.data);
      }
    } finally {
      setSearching(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setContacts(initialContacts);
      return;
    }
    debounceRef.current = setTimeout(() => { void search(query); }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search, initialContacts]);

  function handleCreated(contact: Contact) {
    setContacts((prev) => [contact, ...prev]);
    setShowModal(false);
    toast("Contact created", { variant: "success" });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 flex-1">Contacts</h1>
          <div className="w-64">
            <Input
              placeholder="Search contacts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Link href="/contacts/import">
            <Button variant="secondary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import CSV
            </Button>
          </Link>
          <Button onClick={() => setShowModal(true)}>Add Contact</Button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {searching ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    Searching…
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    {query ? "No contacts match your search." : "No contacts yet. Add your first contact."}
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer group">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link href={`/contacts/${c.id}`} className="block group-hover:text-brand-600 transition-colors">
                        {c.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <Link href={`/contacts/${c.id}`} className="block">
                        {c.phoneNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <Link href={`/contacts/${c.id}`} className="block">
                        {c.email ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${c.id}`} className="block">
                        <Badge variant={stageVariant[c.lifecycleStage] ?? "gray"}>
                          {c.lifecycleStage}
                        </Badge>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddContactModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
      />

      <Toast
        title={toastState.title}
        variant={toastState.variant}
        open={toastState.open}
        onOpenChange={setToastOpen}
      />
    </>
  );
}
