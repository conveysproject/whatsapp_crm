import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { IMPERSONATION_COOKIE, IMPERSONATION_META_COOKIE } from "@/lib/server-api";
import { parseSessionObject, type ImpersonationSession } from "@/lib/impersonation";

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

function remainingSeconds(expiresAt: number): number {
  return Math.min(Math.floor((expiresAt - Date.now()) / 1000), MAX_AGE_SECONDS);
}

function writeSession(res: NextResponse, s: ImpersonationSession, maxAge: number): void {
  const { token, ...meta } = s;
  res.cookies.set(IMPERSONATION_COOKIE, token, cookieOptions(maxAge));
  res.cookies.set(IMPERSONATION_META_COOKIE, JSON.stringify(meta), cookieOptions(maxAge));
}

async function readSession(): Promise<ImpersonationSession | null> {
  const jar = await cookies();
  const token = jar.get(IMPERSONATION_COOKIE)?.value;
  const metaRaw = jar.get(IMPERSONATION_META_COOKIE)?.value;
  if (!token || !metaRaw) return null;
  try {
    return parseSessionObject({ ...(JSON.parse(metaRaw) as object), token });
  } catch {
    return null;
  }
}

const unauthorized = () => NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
const invalid = () => NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
const noStore = { "Cache-Control": "no-store" };

/** Return the current session record (including the token) to the signed-in user, or 204. */
export async function GET(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return unauthorized();
  const session = await readSession();
  if (!session) return new NextResponse(null, { status: 204, headers: noStore });
  return NextResponse.json(session, { headers: noStore });
}

/** Start a session: set both cookies. Never echoes the token back. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return unauthorized();

  const body = (await request.json().catch(() => null)) as unknown;
  const session = parseSessionObject(body);
  if (!session || session.token.length < 8 || session.token.length > 512) return invalid();
  const maxAge = remainingSeconds(session.expiresAt);
  if (maxAge <= 0) return invalid();

  const res = new NextResponse(null, { status: 204, headers: noStore });
  writeSession(res, session, maxAge);
  return res;
}

/** Update the mode to "edit" after a successful elevate. Expiry is never extended. */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return unauthorized();

  const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
  if (body?.mode !== "edit") return invalid();
  const current = await readSession();
  if (!current) return new NextResponse(null, { status: 404, headers: noStore });

  const res = new NextResponse(null, { status: 204, headers: noStore });
  writeSession(res, { ...current, mode: "edit" }, remainingSeconds(current.expiresAt));
  return res;
}

/** End the session: clear both cookies. */
export async function DELETE(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return unauthorized();
  const res = new NextResponse(null, { status: 204, headers: noStore });
  res.cookies.set(IMPERSONATION_COOKIE, "", cookieOptions(0));
  res.cookies.set(IMPERSONATION_META_COOKIE, "", cookieOptions(0));
  return res;
}
