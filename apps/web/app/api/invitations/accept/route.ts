import { clerkClient } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

// Server-side invitation acceptance — creates Clerk user without email verification.
// The invitation token already proves email ownership (user clicked the link in their inbox).

const API_URL = (process.env["API_URL"] ?? process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000").replace(/\/$/, "");

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, email, fullName, password } = body as {
    token?: string;
    email?: string;
    fullName?: string;
    password?: string;
  };

  if (!token || !email || !fullName || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const nameParts = fullName.trim().split(" ");
  const firstName = nameParts[0] ?? fullName;
  const lastName = nameParts.slice(1).join(" ") || "-";

  // Step 1: Create Clerk user server-side — skips email verification
  // (invitation link already proved email ownership)
  let clerkUserId: string;
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.createUser({
      emailAddress: [email],
      password,
      firstName,
      lastName,
      skipPasswordChecks: false,
    });
    clerkUserId = user.id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create account";
    console.error("[invitations/accept] Clerk createUser error:", msg);
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // Step 2: Accept invitation in the Railway DB
  try {
    const res = await fetch(`${API_URL}/v1/invitations/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clerkUserId, fullName }),
    });
    if (!res.ok) {
      const json = await res.json() as { error?: { message?: string } };
      // Clean up the Clerk user we just created so it doesn't orphan
      try {
        const clerk = await clerkClient();
        await clerk.users.deleteUser(clerkUserId);
      } catch { /* best-effort cleanup */ }
      return NextResponse.json({ error: json.error?.message ?? "Failed to accept invitation" }, { status: res.status });
    }
  } catch {
    return NextResponse.json({ error: "Network error contacting API" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
