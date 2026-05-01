import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export async function POST(request: Request): Promise<NextResponse> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await request.json();

  const res = await fetch(`${API_URL}/v1/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await res.json();
  if (!res.ok) {
    const err = data as { error?: string };
    return NextResponse.json({ error: err.error ?? "Registration failed" }, { status: res.status });
  }

  const response = NextResponse.json(data);
  // Onboarding-complete signal — read by middleware to skip /business-details redirect.
  // httpOnly so JS can't clear it; 1-year TTL; re-set on every successful submission.
  response.cookies.set("tc_registered", "1", {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}