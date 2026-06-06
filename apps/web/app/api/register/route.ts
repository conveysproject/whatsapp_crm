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

  return NextResponse.json(data);
}