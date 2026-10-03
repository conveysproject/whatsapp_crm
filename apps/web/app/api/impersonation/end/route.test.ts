import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

describe("GET /api/impersonation/end", () => {
  it("clears imp_token and imp_meta and redirects to /admin/organizations", async () => {
    const { GET } = await import("./route");
    const { NextRequest } = await import("next/server");
    const res = GET(new NextRequest("http://localhost:3000/api/impersonation/end"));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/admin/organizations");
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/imp_token=;/);
    expect(setCookie).toMatch(/imp_meta=;/);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});
