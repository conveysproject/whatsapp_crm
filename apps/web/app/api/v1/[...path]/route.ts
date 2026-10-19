import { getImpersonationCookie } from "@/lib/server-api";
import { isImpersonationAdminPath } from "@/lib/impersonation";
import { type NextRequest, NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth/config";
import { clearSessionCookies, setSessionCookies } from "@/lib/auth/bff";
import { resolveProxyToken, type ProxyTokenResult } from "@/lib/auth/proxy-token";

const API_URL = (process.env["API_URL"] ?? process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000").replace(/\/$/, "");

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const session: ProxyTokenResult = await resolveProxyToken(request, {
    at: request.cookies.get(COOKIE.access)?.value,
    rt: request.cookies.get(COOKIE.refresh)?.value,
  });
  const token = session.token;

  const upstream = `${API_URL}/v1/${path.join("/")}${request.nextUrl.search}`;

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token ?? ""}`);

  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  // Real-admin calls (issue/elevate/revoke) never carry the impersonation token, even from the cookie.
  const adminImpersonationCall = isImpersonationAdminPath(`/v1/${path.join("/")}`);
  const impersonateToken = adminImpersonationCall
    ? null
    : (request.headers.get("x-impersonate-token") ?? (await getImpersonationCookie()));
  if (impersonateToken) headers.set("x-impersonate-token", impersonateToken);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const res = await fetch(upstream, {
    method: request.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
  });

  const resBody = await res.arrayBuffer();
  const out = new NextResponse(resBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
  if (session.rotated) setSessionCookies(out, session.rotated);
  else if (session.clear) clearSessionCookies(out);
  return out;
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  return proxy(request, (await params).path);
}
export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  return proxy(request, (await params).path);
}
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  return proxy(request, (await params).path);
}
export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  return proxy(request, (await params).path);
}
export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  return proxy(request, (await params).path);
}
