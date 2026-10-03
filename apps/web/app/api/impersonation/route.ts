import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { IMPERSONATION_COOKIE } from "@/lib/server-api";

const MAX_AGE_SECONDS = 900;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

/** Set the impersonation session cookie. Never echoes the token back. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { token?: unknown; expiresAt?: unknown } | null;
  const token = body?.token;
  const expiresAt = body?.expiresAt;
  if (typeof token !== "string" || token.length < 8 || token.length > 512 || typeof expiresAt !== "number") {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  }
  const remaining = Math.floor((expiresAt - Date.now()) / 1000);
  if (remaining <= 0) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });

  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(IMPERSONATION_COOKIE, token, cookieOptions(Math.min(remaining, MAX_AGE_SECONDS)));
  return res;
}

/** Clear the impersonation session cookie. */
export async function DELETE(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(IMPERSONATION_COOKIE, "", cookieOptions(0));
  return res;
}
