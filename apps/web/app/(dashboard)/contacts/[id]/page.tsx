import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ContactForm } from "@/components/contacts/ContactForm";

interface Contact {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
  lifecycleStage: string;
  tags: string[];
}

async function getContact(id: string, token: string): Promise<Contact | null> {
  try {
    const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/contacts/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json() as { data: Contact }).data;
  } catch { return null; }
}

async function updateContact(id: string, token: string, data: Partial<Contact>): Promise<void> {
  await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
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

  async function handleUpdate(data: {
    name: string;
    email: string;
    lifecycleStage: string;
    tags: string[];
  }): Promise<void> {
    "use server";
    const { getToken: gt } = await auth.protect();
    const t = await gt();
    await updateContact(id, t ?? "", data);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/contacts" className="text-sm text-gray-500 hover:text-gray-700">
          ← Contacts
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">
          {contact.name ?? contact.phoneNumber}
        </h1>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
        <ContactForm
          phoneNumber={contact.phoneNumber}
          initial={{
            name: contact.name ?? "",
            email: contact.email ?? "",
            lifecycleStage: contact.lifecycleStage,
            tags: contact.tags,
          }}
          onSubmit={handleUpdate}
          submitLabel="Update Contact"
        />
      </div>
    </div>
  );
}
