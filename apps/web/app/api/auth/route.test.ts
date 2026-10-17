import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/auth/jwt", async (orig) => {
  const actual = await orig<typeof import("../../../lib/auth/jwt")>();
  return { ...actual, verifyAccessToken: vi.fn(async () => ({ userId: "u1", sid: "s", typ: "user" })) };
});

import { GET, POST } from "./[...action]/route";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (expSec: number) => `${b64({ alg: "none" })}.${b64({ exp: expSec })}.sig`;
const nowSec = () => Math.floor(Date.now() / 1000);

const ORIGIN = "http://localhost:3000";
const ctx = (action: string) => ({ params: Promise.resolve({ action: action.split("/") }) });
const post = (action: string, body: unknown, headers: Record<string, string> = {}, cookie?: string) =>
  POST(
    new NextRequest(`${ORIGIN}/api/auth/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { origin: ORIGIN, "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    }),
    ctx(action),
  );
const getToken = (cookie?: string) =>
  GET(new NextRequest(`${ORIGIN}/api/auth/token`, { headers: cookie ? { cookie } : {} }), ctx("token"));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env["NEXT_PUBLIC_AUTH_PROVIDER"] = "wbmsg";
  process.env["AUTH_BFF_SECRET"] = "bffsecret";
  process.env["API_URL"] = "http://api.test";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["NEXT_PUBLIC_AUTH_PROVIDER"];
  delete process.env["AUTH_BFF_SECRET"];
  delete process.env["API_URL"];
});

describe("BFF auth routes", () => {
  it("404s every action in clerk mode", async () => {
    process.env["NEXT_PUBLIC_AUTH_PROVIDER"] = "clerk";
    expect((await post("sign-out", {})).status).toBe(404);
    expect((await getToken()).status).toBe(404);
  });

  it("404s unknown actions", async () => {
    expect((await post("nope", {})).status).toBe(404);
  });

  it("rejects cross-origin POST with 403 and no upstream call", async () => {
    const res = await post("sign-in/password", {}, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "FORBIDDEN", message: "Bad origin" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sign-in/password sets cookies, strips tokens, adds device/client and BFF headers", async () => {
    fetchMock.mockResolvedValue(
      json(200, { accessToken: "AT", refreshToken: "RT", deviceId: "DEV", next: "done", organizationId: "o1" }),
    );
    const res = await post(
      "sign-in/password",
      { email: "a@b.co", password: "x" },
      { "x-forwarded-for": "1.2.3.4, 5.6.7.8", "user-agent": "UA" },
      "wb_dev=olddev",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ next: "done", organizationId: "o1" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/v1/auth/signin/password");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "a@b.co",
      password: "x",
      client: "web",
      deviceId: "olddev",
    });
    const h = init.headers as Record<string, string>;
    expect(h["x-wbmsg-bff"]).toBe("bffsecret");
    expect(h["x-wbmsg-client-ip"]).toBe("1.2.3.4");
    expect(h["user-agent"]).toBe("UA");
    const rt = res.cookies.get("wb_rt")!;
    expect(rt).toMatchObject({ value: "RT", httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 2_592_000 });
    expect(res.cookies.get("wb_at")).toMatchObject({ value: "AT", maxAge: 600, httpOnly: true, path: "/" });
    expect(res.cookies.get("wb_dev")).toMatchObject({ value: "DEV", maxAge: 7_776_000, httpOnly: true, path: "/" });
  });

  it("new_device challenge sets no cookies", async () => {
    fetchMock.mockResolvedValue(json(200, { next: "new_device", challengeId: "c1" }));
    const res = await post("sign-in/password", { email: "a@b.co", password: "x" });
    expect(await res.json()).toEqual({ next: "new_device", challengeId: "c1" });
    expect(res.cookies.getAll()).toHaveLength(0);
  });

  it("does not set cookies on upstream errors and forwards status", async () => {
    fetchMock.mockResolvedValue(json(401, { error: { code: "INVALID", message: "no" } }));
    const res = await post("sign-in/password", {});
    expect(res.status).toBe(401);
    expect(res.cookies.getAll()).toHaveLength(0);
  });

  it("invitations/accept maps the token into the API path and validates it", async () => {
    fetchMock.mockResolvedValue(json(201, { accessToken: "A", refreshToken: "R", organizationId: "o" }));
    const res = await post("invitations/accept/abc-123", { password: "p" });
    expect(res.status).toBe(201);
    expect(fetchMock.mock.calls[0]![0]).toBe("http://api.test/v1/auth/invitations/abc-123/accept");
    expect(res.cookies.get("wb_rt")?.value).toBe("R");
    fetchMock.mockClear();
    expect((await post("invitations/accept/bad%2Ftoken", {})).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sign-up never sets cookies", async () => {
    fetchMock.mockResolvedValue(json(200, { accessToken: "A", refreshToken: "R" }));
    const res = await post("sign-up", { email: "a@b.co" });
    expect(res.cookies.getAll()).toHaveLength(0);
  });

  it("maps upstream network failure to 503", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const res = await post("sign-up", {});
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "UNAVAILABLE", message: "Please try again." } });
  });

  it("sign-out clears cookies even if upstream fails", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const at = jwt(nowSec() + 500);
    const res = await post("sign-out", {}, {}, `wb_at=${at}; wb_rt=RT`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ authorization: `Bearer ${at}` });
    for (const n of ["wb_rt", "wb_dev", "wb_at"]) expect(res.cookies.get(n)).toMatchObject({ value: "", maxAge: 0 });
  });
});

describe("GET token", () => {
  it("returns a fresh wb_at without calling upstream", async () => {
    const at = jwt(nowSec() + 500);
    const res = await getToken(`wb_at=${at}; wb_rt=RT`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBe(at);
    expect(body.userId).toBe("u1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes once for two concurrent calls with a stale token", async () => {
    const fresh = jwt(nowSec() + 600);
    fetchMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return json(200, { accessToken: fresh, refreshToken: "RT2", expiresIn: 600 });
    });
    const cookie = `wb_at=${jwt(nowSec() + 10)}; wb_rt=RT`;
    const [a, b] = await Promise.all([getToken(cookie), getToken(cookie)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ "x-wbmsg-bff": "bffsecret" });
    for (const r of [a, b]) {
      expect(r.status).toBe(200);
      expect(r.cookies.get("wb_rt")?.value).toBe("RT2");
      expect(r.cookies.get("wb_at")?.value).toBe(fresh);
      expect((await r.json()).userId).toBe("u1");
    }
  });

  it("refresh 401 clears cookies", async () => {
    fetchMock.mockResolvedValue(json(401, { error: { code: "SESSION_EXPIRED", message: "x" } }));
    const res = await getToken("wb_rt=RT");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ accessToken: null });
    expect(res.cookies.get("wb_rt")).toMatchObject({ value: "", maxAge: 0 });
  });

  it("refresh 503 keeps cookies", async () => {
    fetchMock.mockResolvedValue(json(503, { error: { code: "UNAVAILABLE", message: "x" } }));
    const res = await getToken("wb_rt=RT");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ accessToken: null });
    expect(res.cookies.getAll()).toHaveLength(0);
  });

  it("no cookies gives 401", async () => {
    const res = await getToken();
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fix round 1", () => {
  it("refresh ok but verify fails: 503 with rotated cookies persisted", async () => {
    const jwtMod = await import("../../../lib/auth/jwt");
    vi.mocked(jwtMod.verifyAccessToken).mockResolvedValueOnce(null);
    fetchMock.mockResolvedValue(json(200, { accessToken: jwt(nowSec() + 600), refreshToken: "RT2" }));
    const res = await getToken("wb_rt=RT");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ accessToken: null });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.cookies.get("wb_rt")?.value).toBe("RT2");
  });

  it("ignores client-supplied deviceId/client/tokens", async () => {
    fetchMock.mockResolvedValue(json(200, { next: "x" }));
    await post("sign-in/password", { email: "a", deviceId: "evil", client: "mobile", accessToken: "a", refreshToken: "r" });
    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(sent).toEqual({ email: "a", client: "web" });
    fetchMock.mockClear();
    await post("sign-up", { email: "a", client: "mobile", deviceId: "evil" });
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ email: "a" });
  });

  it("sign-out refreshes first when wb_at is missing", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { accessToken: "NEWAT", refreshToken: "R2" }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const res = await post("sign-out", {}, {}, "wb_rt=RT");
    expect(fetchMock.mock.calls[0]![0]).toBe("http://api.test/v1/auth/refresh");
    expect(fetchMock.mock.calls[1]![0]).toBe("http://api.test/v1/auth/signout");
    expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toMatchObject({ authorization: "Bearer NEWAT" });
    expect(res.cookies.get("wb_rt")).toMatchObject({ value: "", maxAge: 0 });
  });

  it("sign-out uses a fresh wb_at without refreshing", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    const at = jwt(nowSec() + 500);
    await post("sign-out", {}, {}, `wb_at=${at}; wb_rt=RT`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ authorization: `Bearer ${at}` });
  });

  it("forwards Retry-After", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "x" } }), {
        status: 429,
        headers: { "retry-after": "42" },
      }),
    );
    const res = await post("sign-up", {});
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
  });

  it("uses x-real-ip fallback and omits bff header when secret unset", async () => {
    delete process.env["AUTH_BFF_SECRET"];
    fetchMock.mockResolvedValue(json(200, {}));
    await post("sign-up", {}, { "x-real-ip": "9.9.9.9" });
    const h = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(h["x-wbmsg-client-ip"]).toBe("9.9.9.9");
    expect(h["x-wbmsg-bff"]).toBeUndefined();
  });

  it("accepts NEXT_PUBLIC_APP_URL origin", async () => {
    process.env["NEXT_PUBLIC_APP_URL"] = "https://app.example.com/";
    try {
      fetchMock.mockResolvedValue(json(200, {}));
      expect((await post("sign-up", {}, { origin: "https://app.example.com" })).status).toBe(200);
    } finally {
      delete process.env["NEXT_PUBLIC_APP_URL"];
    }
  });
});
