import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface Template {
  id: string;
  name: string;
  category: string;
  language: string;
  status: "pending" | "approved" | "rejected";
}

async function getTemplates(token: string): Promise<Template[]> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const res = await fetch(`${apiUrl}/v1/templates`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json() as { data: Template[] }).data;
}

const statusVariant: Record<string, "yellow" | "green" | "red"> = {
  pending: "yellow",
  approved: "green",
  rejected: "red",
};

export default async function TemplatesPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const templates = await getTemplates(await getToken() ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Templates</h1>
        <Link href="/templates/new">
          <Button>New Template</Button>
        </Link>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {templates.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No templates yet.</p>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-500">
                  {t.category} · {t.language}
                </p>
              </div>
              <Badge variant={statusVariant[t.status] ?? "gray"}>{t.status}</Badge>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
