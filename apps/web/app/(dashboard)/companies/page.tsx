import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  createdAt: string;
}

async function getCompanies(token: string): Promise<Company[]> {
  try {
    const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/companies`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json() as { data: Company[] }).data;
  } catch { return []; }
}

export default async function CompaniesPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken();
  const companies = await getCompanies(token ?? "");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Companies</h1>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Domain</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Industry</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {companies.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  No companies yet
                </td>
              </tr>
            ) : (
              companies.map((company) => (
                <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/companies/${company.id}`}
                      className="font-medium text-gray-900 hover:text-brand-600"
                    >
                      {company.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{company.domain ?? "—"}</td>
                  <td className="px-4 py-3">
                    {company.industry ? (
                      <Badge variant="gray">{company.industry}</Badge>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
