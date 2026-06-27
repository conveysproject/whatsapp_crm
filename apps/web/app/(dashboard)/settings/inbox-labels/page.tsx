import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { InboxLabelsClient, type InboxLabelStat } from "./InboxLabelsClient";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getInboxLabels(token: string): Promise<InboxLabelStat[]> {
  try {
    const res = await fetch(`${API_URL}/v1/inbox-labels`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: InboxLabelStat[] }).data : [];
  } catch { return []; }
}

export default async function InboxLabelsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken() ?? "";
  const labels = await getInboxLabels(token);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conversation Labels</h1>
        <p className="text-sm text-gray-500 mt-1">Labels assigned to inbox conversations for queue management.</p>
      </div>
      <InboxLabelsClient initialLabels={labels} />
    </div>
  );
}
