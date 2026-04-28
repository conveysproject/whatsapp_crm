import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
}

async function getCompany(id: string, token: string): Promise<Company | null> {
  const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/companies/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json() as { data: Company };
  return body.data;
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const { id } = await params;
  const { getToken } = await auth.protect();
  const token = await getToken();
  const company = await getCompany(id, token ?? "");
  if (!company) notFound();

  async function handleUpdate(formData: FormData): Promise<void> {
    "use server";
    const { getToken: gt } = await auth.protect();
    const t = await gt();
    await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/companies/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${t ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        domain: formData.get("domain") || null,
        industry: formData.get("industry") || null,
        size: formData.get("size") || null,
      }),
    });
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/companies" className="text-sm text-gray-500 hover:text-gray-700">
          ← Companies
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">{company.name}</h1>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
        <form action={handleUpdate} className="space-y-4">
          <Input label="Name" name="name" defaultValue={company.name} placeholder="Company name" />
          <Input label="Domain" name="domain" defaultValue={company.domain ?? ""} placeholder="example.com" />
          <Input label="Industry" name="industry" defaultValue={company.industry ?? ""} placeholder="SaaS, Finance…" />
          <Input label="Size" name="size" defaultValue={company.size ?? ""} placeholder="1-10, 11-50…" />
          <Button type="submit">Update Company</Button>
        </form>
      </div>
    </div>
  );
}
