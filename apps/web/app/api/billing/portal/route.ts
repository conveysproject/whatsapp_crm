import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export async function POST(request: Request): Promise<NextResponse> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const origin = request.headers.get("origin") ?? "";

  const res = await fetch(`${API_URL}/v1/billing/portal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ returnUrl: `${origin}/settings/billing` }),
  });

  if (!res.ok) return NextResponse.json({ error: "Portal failed" }, { status: 500 });
  const json = await res.json() as { data: { url: string } };
  return NextResponse.redirect(json.data.url);
}
