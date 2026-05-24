import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TemplateSyncButton } from "./TemplateSyncButton";
import { TemplateRow, type TemplateData } from "./TemplateRow";

async function getTemplates(token: string): Promise<TemplateData[]> {
  try {
    const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
    const res = await fetch(`${apiUrl}/v1/templates`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json() as { data: TemplateData[] }).data;
  } catch { return []; }
}

export default async function TemplatesPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const templates = await getTemplates(await getToken() ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Templates</h1>
        <div className="flex items-center gap-3">
          <TemplateSyncButton />
          <Link href="/templates/new">
            <Button>New Template</Button>
          </Link>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {templates.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No templates yet.</p>
        ) : (
          templates.map((t) => <TemplateRow key={t.id} template={t} />)
        )}
      </div>
    </div>
  );
}
