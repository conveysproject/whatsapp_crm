import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ContactDetailClient, type Contact } from "./ContactDetailClient";

async function getContact(id: string, token: string): Promise<Contact | null> {
  try {
    const res = await fetch(
      `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/contacts/${id}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return null;
    return (await res.json() as { data: Contact }).data;
  } catch {
    return null;
  }
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const { id } = await params;
  const { getToken } = await auth.protect();
  const token = await getToken();
  const contact = await getContact(id, token ?? "");
  if (!contact) notFound();

  return (
    <div className="flex flex-col h-full -mx-6 -my-6">
      <ContactDetailClient contact={contact} />
    </div>
  );
}
