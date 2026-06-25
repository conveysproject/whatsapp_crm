import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TemplateSyncButton } from "./TemplateSyncButton";
import type { TemplateData } from "./TemplateRow";
import { TemplateLibraryTab } from "./TemplateLibraryTab";
import { TemplateActiveTab } from "./TemplateActiveTab";
import { PermissionGate } from "@/components/PermissionGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getTemplates(token: string): Promise<TemplateData[]> {
  try {
    const res = await fetch(`${API_URL}/v1/templates`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json() as { data: TemplateData[] }).data;
  } catch { return []; }
}

async function getUserRole(token: string): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return "agent";
    const json = await res.json() as { data?: { role?: string } };
    return json.data?.role ?? "agent";
  } catch { return "agent"; }
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken() ?? "";
  const { tab } = await searchParams;
  const activeTab = tab === "library" ? "library" : "active";

  const [templates, userRole] = await Promise.all([
    activeTab === "active" ? getTemplates(token) : Promise.resolve([]),
    getUserRole(token),
  ]);

  const canManage = ["admin", "superAdmin", "manager"].includes(userRole);

  return (
    <PermissionGate permission="templates_access">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Templates</h1>
          <div className="flex items-center gap-3">
            {activeTab === "active" && <TemplateSyncButton />}
            {canManage && activeTab === "active" && (
              <Link href="/templates/new">
                <Button>New Template</Button>
              </Link>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <Link
            href="/templates?tab=library"
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "library"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Template Library
          </Link>
          <Link
            href="/templates"
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "active"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Active
          </Link>
        </div>

        {/* Tab content */}
        {activeTab === "library" ? (
          <TemplateLibraryTab />
        ) : (
          <TemplateActiveTab templates={templates} />
        )}
      </div>
    </PermissionGate>
  );
}
