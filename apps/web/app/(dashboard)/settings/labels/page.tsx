import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { LabelsClient } from "./LabelsClient";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface Label {
  id: string;
  title: string;
  textColor: string | null;
  bgColor: string | null;
  isActive: boolean;
}

async function getLabels(token: string): Promise<Label[]> {
  try {
    const res = await fetch(`${API_URL}/v1/labels`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: Label[] }).data : [];
  } catch { return []; }
}

export default async function LabelsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken() ?? "";
  const labels = await getLabels(token);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Labels</h1>
          <p className="text-sm text-gray-500 mt-1">
            Organize contacts and messages with colored labels.
          </p>
        </div>
      </div>
      <LabelsClient initialLabels={labels} />
    </div>
  );
}
