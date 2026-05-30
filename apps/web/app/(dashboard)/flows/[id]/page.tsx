import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { FlowEditor } from "@/components/flows/FlowEditor";
import type { FlowData } from "@/components/flows/utils/serialize";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export default async function FlowEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const { id } = await params;
  const token = await getToken();

  const res = await fetch(`${API_URL}/v1/flows/${id}`, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
    cache: "no-store",
  });

  if (!res.ok) notFound();

  const flow = (await res.json() as { data: FlowData }).data;

  return (
    <div className="-m-6 h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden">
      <FlowEditor initialFlow={flow} />
    </div>
  );
}
