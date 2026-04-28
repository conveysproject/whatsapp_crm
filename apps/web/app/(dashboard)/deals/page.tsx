import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/Button";
import { KanbanBoard } from "@/components/deals/KanbanBoard";

interface Pipeline {
  id: string;
  name: string;
  stages: string[];
}

interface Deal {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  assignedTo: string | null;
  pipelineId: string;
}

async function getData(token: string) {
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const headers = { Authorization: `Bearer ${token}` };
  const [pRes, dRes] = await Promise.all([
    fetch(`${api}/v1/pipelines`, { headers, cache: "no-store" }),
    fetch(`${api}/v1/deals`, { headers, cache: "no-store" }),
  ]);
  const pipelines: Pipeline[] = pRes.ok ? (await pRes.json() as { data: Pipeline[] }).data : [];
  const deals: Deal[] = dRes.ok ? (await dRes.json() as { data: Deal[] }).data : [];
  return { pipelines, deals };
}

export default async function DealsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken();
  const { pipelines, deals } = await getData(token ?? "");

  const pipeline = pipelines[0];

  if (!pipeline) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">Deals</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-card">
          <p className="text-sm text-gray-500 mb-4">
            No pipeline yet. Create one to start tracking deals.
          </p>
          <Button>Create Pipeline</Button>
        </div>
      </div>
    );
  }

  const stages = Array.isArray(pipeline.stages)
    ? (pipeline.stages as string[])
    : ["new", "qualified", "proposal", "won", "lost"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Deals — {pipeline.name}</h1>
        <Button>Add Deal</Button>
      </div>
      <KanbanBoard
        initialDeals={deals.filter((d) => d.pipelineId === pipeline.id)}
        stages={stages}
      />
    </div>
  );
}
