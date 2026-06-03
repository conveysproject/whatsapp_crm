import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { CannedResponsesClient } from "./CannedResponsesClient";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface CannedResponse {
  id: string;
  name: string;
  shortcut: string | null;
  content: string;
  mediaData: Record<string, unknown> | null;
}

async function getCannedResponses(token: string): Promise<CannedResponse[]> {
  try {
    const res = await fetch(`${API_URL}/v1/canned-responses`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: CannedResponse[] }).data : [];
  } catch { return []; }
}

export default async function CannedResponsesPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken() ?? "";
  const items = await getCannedResponses(token);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Canned Responses</h1>
        <p className="text-sm text-gray-500 mt-1">
          Saved reply templates. Use shortcuts (e.g. <code className="bg-gray-100 px-1 rounded text-xs">/hi</code>) in the inbox to insert them instantly.
        </p>
      </div>
      <CannedResponsesClient initialItems={items} />
    </div>
  );
}
