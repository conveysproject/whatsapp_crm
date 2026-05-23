import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

const API_URL = (process.env["API_URL"] ?? process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000").replace(/\/$/, "");

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const { getToken } = await auth();
  const token = await getToken();

  const upstream = `${API_URL}/v1/${path.join("/")}${request.nextUrl.search}`;

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token ?? ""}`);

  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const res = await fetch(upstream, {
    method: request.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
  });

  const resBody = await res.arrayBuffer();
  return new NextResponse(resBody, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
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
