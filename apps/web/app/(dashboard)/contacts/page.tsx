import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { ContactsClient } from "@/components/contacts/ContactsClient";
import type { Contact } from "@/components/contacts/AddContactModal";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getContacts(token: string): Promise<Contact[]> {
  try {
    const res = await fetch(`${API}/v1/contacts?limit=50`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json() as { data: Contact[] }).data;
  } catch { return []; }
}

async function getUserRole(token: string): Promise<string> {
  try {
    const res = await fetch(`${API}/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!res.ok) return "agent";
    const json = await res.json() as { data?: { role?: string } };
    return json.data?.role ?? "agent";
  } catch { return "agent"; }
}

export default async function ContactsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken() ?? "";
  const [contacts, userRole] = await Promise.all([getContacts(token), getUserRole(token)]);
  return <ContactsClient initialContacts={contacts} userRole={userRole} />;
}
