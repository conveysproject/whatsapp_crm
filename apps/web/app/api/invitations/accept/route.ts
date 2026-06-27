import { clerkClient } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

const API_URL = (process.env["API_URL"] ?? process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000").replace(/\/$/, "");

// UUID v4 — the only valid token format. Rejects all junk before touching the DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── In-memory rate limiter (per serverless instance) ─────────────────────────
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const ipAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

function purgeStaleEntries() {
  const now = Date.now();
  for (const [ip, entry] of ipAttempts) {
    if (now > entry.resetAt) ipAttempts.delete(ip);
  }
}

async function slowFail(res: NextResponse, ms = 1500): Promise<NextResponse> {
  await new Promise((r) => setTimeout(r, ms));
  return res;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (Math.random() < 0.05) purgeStaleEntries();
  if (isRateLimited(ip)) {
    return slowFail(
      NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 })
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, fullName, password, mobileNumber } = body as {
    token?: string;
    fullName?: string;
    password?: string;
    mobileNumber?: string;
  };

  // ── Input validation ───────────────────────────────────────────────────────
  if (!token || !fullName || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!UUID_RE.test(token)) {
    return slowFail(NextResponse.json({ error: "Invalid invitation" }, { status: 400 }));
  }
  if (typeof fullName !== "string" || fullName.trim().length < 2 || fullName.trim().length > 100) {
    return NextResponse.json({ error: "Full name must be 2–100 characters" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: "Password must be 8–128 characters" }, { status: 400 });
  }

  // ── Step 1: Validate token — email and org come from DB, never from client ─
  let invitationEmail: string;
  let organizationId: string;
  let invitationRole: string;
  try {
    const inviteRes = await fetch(`${API_URL}/v1/invitations/${encodeURIComponent(token)}`);
    if (!inviteRes.ok) {
      return slowFail(NextResponse.json({ error: "Invalid invitation" }, { status: 404 }));
    }
    const inviteJson = await inviteRes.json() as {
      data: { email: string; role: string; organizationId: string };
    };
    invitationEmail = inviteJson.data.email;
    organizationId = inviteJson.data.organizationId;
    invitationRole = inviteJson.data.role;
  } catch {
    return NextResponse.json({ error: "Could not verify invitation" }, { status: 502 });
  }

  // ── Step 2: Create Clerk user server-side (no email verification needed) ───
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0]!;
  const lastName = nameParts.slice(1).join(" ") || "-";

  let clerkUserId: string;
  const clerk = await clerkClient();

  try {
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

  // ── Step 3: Add user to Clerk organization ────────────────────────────────
  // This triggers the organizationMembership.created webhook on Railway,
  // which upserts the DB user with the correct role and marks the invitation accepted.
  const clerkRole = invitationRole === "admin" ? "org:admin" : "org:member";

  try {
    await clerk.organizations.createOrganizationMembership({
      organizationId,
      userId: clerkUserId,
      role: clerkRole,
    });
  } catch (err: unknown) {
    // Cleanup: delete the Clerk user so they can retry
    try { await clerk.users.deleteUser(clerkUserId); } catch { /* best-effort */ }
    const msg = err instanceof Error ? err.message : "Failed to join organization";
    console.error("[invitations/accept] Clerk org membership error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── Step 4: Notify backend accept endpoint to write mobileNumber ─────────
  // The Clerk webhook handles DB user creation, but mobileNumber is not
  // available there. Call the accept endpoint directly to persist it.
  if (mobileNumber) {
    try {
      await fetch(`${API_URL}/v1/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId, fullName: fullName.trim(), mobileNumber }),
      });
    } catch {
      // Non-fatal: mobile number persistence failure should not block sign-up
      console.error("[invitations/accept] Failed to persist mobileNumber");
    }
  }

  return NextResponse.json({ ok: true });
}
