import { clerkClient } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

const API_URL = (process.env["API_URL"] ?? process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000").replace(/\/$/, "");

// UUID v4 — the only valid token format. Rejects all junk before touching the DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── In-memory rate limiter (per serverless instance) ─────────────────────────
// Not a hard guarantee across all instances, but adds meaningful friction for
// automated tools hitting this endpoint. 5 attempts per IP per 15 minutes.
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

// Purge stale entries so the Map doesn't grow unbounded across long-lived instances
function purgeStaleEntries() {
  const now = Date.now();
  for (const [ip, entry] of ipAttempts) {
    if (now > entry.resetAt) ipAttempts.delete(ip);
  }
}

// ── Minimum response time for failed attempts (slows down automated tools) ───
async function slowFail(res: NextResponse, ms = 1500): Promise<NextResponse> {
  await new Promise((r) => setTimeout(r, ms));
  return res;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (Math.random() < 0.05) purgeStaleEntries(); // 5% chance to GC on each request
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

  const { token, fullName, password } = body as {
    token?: string;
    fullName?: string;
    password?: string;
  };

  // ── Input validation ───────────────────────────────────────────────────────
  if (!token || !fullName || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  // Reject non-UUID tokens immediately — no DB round-trip needed
  if (!UUID_RE.test(token)) {
    return slowFail(NextResponse.json({ error: "Invalid invitation" }, { status: 400 }));
  }
  if (typeof fullName !== "string" || fullName.trim().length < 2 || fullName.trim().length > 100) {
    return NextResponse.json({ error: "Full name must be 2–100 characters" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: "Password must be 8–128 characters" }, { status: 400 });
  }

  // ── Step 1: Validate token against DB — email comes from DB, not client ────
  let invitationEmail: string;
  try {
    const inviteRes = await fetch(`${API_URL}/v1/invitations/${encodeURIComponent(token)}`);
    if (!inviteRes.ok) {
      // Use slowFail so scanners can't use response time to distinguish valid vs. invalid tokens
      return slowFail(NextResponse.json({ error: "Invalid invitation" }, { status: 404 }));
    }
    const inviteJson = await inviteRes.json() as { data: { email: string; role: string } };
    invitationEmail = inviteJson.data.email;
  } catch {
    return NextResponse.json({ error: "Could not verify invitation" }, { status: 502 });
  }

  // ── Step 2: Create Clerk user server-side (no email verification needed) ───
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0]!;
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

  // ── Step 3: Accept invitation in Railway DB ────────────────────────────────
  async function cleanupClerkUser() {
    try { const clerk = await clerkClient(); await clerk.users.deleteUser(clerkUserId); } catch { /* best-effort */ }
  }

  try {
    const res = await fetch(`${API_URL}/v1/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clerkUserId, fullName: fullName.trim() }),
    });
    if (!res.ok) {
      await cleanupClerkUser();
      const json = await res.json() as { error?: { message?: string } };
      return NextResponse.json({ error: json.error?.message ?? "Failed to accept invitation" }, { status: res.status });
    }
  } catch {
    await cleanupClerkUser();
    return NextResponse.json({ error: "Network error contacting API" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
