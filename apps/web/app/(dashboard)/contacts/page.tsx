import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { ContactsClient } from "@/components/contacts/ContactsClient";
import type { Contact } from "@/components/contacts/AddContactModal";

async function getContacts(token: string): Promise<Contact[]> {
  try {
    const res = await fetch(
      `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/contacts?limit=50`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    return (await res.json() as { data: Contact[] }).data;
  } catch { return []; }
}

export default async function ContactsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const contacts = await getContacts(await getToken() ?? "");
  return <ContactsClient initialContacts={contacts} />;
}
