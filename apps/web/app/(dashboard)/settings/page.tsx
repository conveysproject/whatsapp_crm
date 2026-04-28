import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

interface Org {
  name: string;
  planTier: string;
}

async function getOrg(token: string): Promise<Org | null> {
  try {
    const res = await fetch(
      `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/organizations/me`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    return res.ok ? (await res.json() as { data: Org }).data : null;
  } catch { return null; }
}

export default async function SettingsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const org = await getOrg(await getToken() ?? "");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Organization Settings</h1>
        <Link href="/settings/members" className="text-sm text-blue-600 hover:underline">
          Manage members →
        </Link>
      </div>

      <div className="bg-white rounded-lg border p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Organization name</label>
          <p className="mt-1 text-gray-900">{org?.name ?? "—"}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Plan</label>
          <p className="mt-1 capitalize text-gray-900">{org?.planTier ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}
