import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { ManageTagsClient } from "./LabelsClient";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface TagStat {
  tag: string;
  count: number;
}

async function getTags(token: string): Promise<TagStat[]> {
  try {
    const res = await fetch(`${API_URL}/v1/tags`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: TagStat[] }).data : [];
  } catch { return []; }
}

export default async function TagsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken() ?? "";
  const tags = await getTags(token);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manage Tags</h1>
        <p className="text-sm text-gray-500 mt-1">Manage tags assigned to your contacts.</p>
      </div>
      <ManageTagsClient initialTags={tags} />
    </div>
  );
}
