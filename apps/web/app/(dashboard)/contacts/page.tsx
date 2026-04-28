import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface Contact {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
  lifecycleStage: string;
}

interface ContactsResponse {
  data: Contact[];
}

const stageVariant: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = {
  customer: "green",
  prospect: "blue",
  lead:     "yellow",
  churned:  "red",
  loyal:    "green",
};

async function getContacts(token: string): Promise<Contact[]> {
  try {
    const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
    const res = await fetch(`${apiUrl}/v1/contacts?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json() as ContactsResponse).data;
  } catch { return []; }
}

export default async function ContactsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken();
  const contacts = await getContacts(token ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Contacts</h1>
        <Button>Add Contact</Button>
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
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No contacts yet. Add your first contact.
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phoneNumber}</td>
                  <td className="px-4 py-3 text-gray-600">{c.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={stageVariant[c.lifecycleStage] ?? "gray"}>
                      {c.lifecycleStage}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
