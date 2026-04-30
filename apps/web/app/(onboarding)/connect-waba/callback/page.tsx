import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export default async function WabaCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}): Promise<JSX.Element> {
  const { code, error: oauthError } = await searchParams;

  if (oauthError || !code) {
    return (
      <div className="text-center">
        <p className="text-red-600 font-medium mb-4">Connection failed. Please try again.</p>
        {oauthError && <p className="text-xs text-gray-500 mb-4 font-mono">{oauthError}</p>}
        <Link href="/connect-waba" className="text-green-600 hover:underline text-sm">Back</Link>
      </div>
    );
  }

  const { getToken } = await auth.protect();
  const token = await getToken();

  const res = await fetch(`${API_URL}/v1/onboarding/waba-callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token ?? ""}`,
    },
    body: JSON.stringify({ code }),
    cache: "no-store",
  });

  if (res.ok) {
    redirect("/provision-number");
  }

  const body = await res.json().catch(() => ({})) as { detail?: { error?: { message?: string } }; error?: { code?: string; message?: string } | string };
  const errorObj = body?.error;
  const detail = body?.detail?.error?.message
    ?? (typeof errorObj === "string" ? errorObj : errorObj?.message)
    ?? `HTTP ${res.status}`;

  return (
    <div className="text-center">
      <p className="text-red-600 font-medium mb-4">Connection failed. Please try again.</p>
      <p className="text-xs text-gray-500 mb-4 font-mono">{detail}</p>
      <Link href="/connect-waba" className="text-green-600 hover:underline text-sm">Back</Link>
    </div>
  );
}
