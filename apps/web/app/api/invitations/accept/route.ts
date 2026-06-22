import { clerkClient } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

// Server-side invitation acceptance — creates Clerk user without email verification.
// The invitation token already proves email ownership (user clicked the link in their inbox).
//
// Security: email is NOT taken from the client. We fetch it from the DB using the token.
// An attacker cannot spoof the email — only a valid, pending, non-expired token is accepted.

const API_URL = (process.env["API_URL"] ?? process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000").replace(/\/$/, "");

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, fullName, password } = body as {
    token?: string;
    fullName?: string;
    password?: string;
  };

  if (!token || !fullName || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (typeof fullName !== "string" || fullName.trim().length === 0) {
    return NextResponse.json({ error: "Invalid full name" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Step 1: Validate token and get email from DB — client cannot spoof the email
  let invitationEmail: string;
  try {
    const inviteRes = await fetch(`${API_URL}/v1/invitations/${encodeURIComponent(token)}`);
    if (!inviteRes.ok) {
      return NextResponse.json({ error: "Invitation not found or expired" }, { status: 404 });
    }
    const inviteJson = await inviteRes.json() as { data: { email: string; role: string } };
    invitationEmail = inviteJson.data.email;
  } catch {
    return NextResponse.json({ error: "Could not verify invitation" }, { status: 502 });
  }

  // Step 2: Create Clerk user with the DB email — skips email verification
  const nameParts = fullName.trim().split(" ");
  const firstName = nameParts[0] ?? fullName;
  const lastName = nameParts.slice(1).join(" ") || "-";

  let clerkUserId: string;
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.createUser({
      emailAddress: [invitationEmail],
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

  // Step 3: Accept invitation in Railway DB
  try {
    const res = await fetch(`${API_URL}/v1/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clerkUserId, fullName: fullName.trim() }),
    });
    if (!res.ok) {
      const json = await res.json() as { error?: { message?: string } };
      // Clean up orphaned Clerk user on Railway failure
      try { const clerk = await clerkClient(); await clerk.users.deleteUser(clerkUserId); } catch { /* best-effort */ }
      return NextResponse.json({ error: json.error?.message ?? "Failed to accept invitation" }, { status: res.status });
    }
  } catch {
    try { const clerk = await clerkClient(); await clerk.users.deleteUser(clerkUserId); } catch { /* best-effort */ }
    return NextResponse.json({ error: "Network error contacting API" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
