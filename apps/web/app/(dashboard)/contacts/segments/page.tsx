import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

interface Segment {
  id: string;
  name: string;
  filters: unknown[];
}

async function getSegments(token: string): Promise<Segment[]> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const res = await fetch(`${apiUrl}/v1/segments`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json() as { data: Segment[] }).data;
}

export default async function SegmentsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken();
  const segments = await getSegments(token ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Segments</h1>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {segments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No segments yet.</p>
        ) : (
          segments.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.filters.length} filter{s.filters.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="blue">{s.filters.length} rules</Badge>
                <Link
                  href={`/contacts/segments/${s.id}`}
                  className="text-sm text-brand-600 hover:underline"
                >
                  View
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
