import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/auth/jwt", async (orig) => {
  const actual = await orig<typeof import("../../../lib/auth/jwt")>();
  return { ...actual, verifyAccessToken: vi.fn(async () => ({ userId: "u1", sid: "s", typ: "user" })) };
});

import { GET, POST } from "./[...action]/route";

const ORIGIN = "http://localhost:3000";
const STATE = "S".repeat(43);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (expSec: number) => `${b64({ alg: "none" })}.${b64({ exp: expSec })}.sig`;
const ctx = (action: string) => ({ params: Promise.resolve({ action: action.split("/") }) });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const formPost = (action: string, fields: Record<string, string>, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest(`${ORIGIN}/api/auth/${action}`, {
      method: "POST",
      body: new URLSearchParams(fields).toString(),
      headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded", ...headers },
    }),
    ctx(action),
  );
const jsonPost = (action: string, body: unknown, cookie?: string) =>
  POST(
    new NextRequest(`${ORIGIN}/api/auth/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { origin: ORIGIN, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    }),
    ctx(action),
  );
const get = (action: string, query = "", cookie?: string) =>
  GET(new NextRequest(`${ORIGIN}/api/auth/${action}${query}`, { headers: cookie ? { cookie } : {} }), ctx(action));

const location = (res: Response) => {
  const l = res.headers.get("location");
  return l ? new URL(l).pathname + new URL(l).search : null;
};
const setCookies = (res: Response) => res.headers.getSetCookie();
const sentBody = (i = 0) => JSON.parse((fetchMock.mock.calls[i] as [string, RequestInit])[1].body as string);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env["NEXT_PUBLIC_AUTH_PROVIDER"] = "wbmsg";
  process.env["API_URL"] = "http://api.test";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["NEXT_PUBLIC_AUTH_PROVIDER"];
  delete process.env["API_URL"];
});

describe("BFF: methods", () => {
  it("proxies the API flags and fails closed", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { whatsapp: true, google: true, facebook: false, extra: 1 }));
    expect(await (await get("methods")).json()).toEqual({ whatsapp: true, google: true, facebook: false });
    fetchMock.mockRejectedValueOnce(new Error("down"));
    expect(await (await get("methods")).json()).toEqual({ whatsapp: false, google: false, facebook: false });
  });

  it("is dark in clerk mode", async () => {
    process.env["NEXT_PUBLIC_AUTH_PROVIDER"] = "clerk";
    expect((await get("methods")).status).toBe(404);
    expect((await formPost("oauth/google/start", {})).status).toBe(404);
  });
});

describe("BFF: oauth start", () => {
  it("rejects a cross-origin form post", async () => {
    const res = await formPost("oauth/google/start", {}, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unknown provider 404s", async () => {
    expect((await formPost("oauth/apple/start", {})).status).toBe(404);
  });

  it("sign-in: 303 to the provider and binds the state to this browser", async () => {
    fetchMock.mockResolvedValue(json(200, { url: "https://accounts.google.com/o/oauth2/v2/auth?state=x", state: STATE }));
    const res = await formPost("oauth/google/start", { redirect_url: "/inbox" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=x");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/v1/auth/oauth/google/start");
    expect(JSON.parse(init.body as string)).toEqual({ intent: "signin", redirectUrl: "/inbox" });
    const cookie = setCookies(res).find((c) => c.startsWith("wb_oauth="))!;
    expect(cookie).toContain(`wb_oauth=signin%3A${STATE}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toContain("Path=/api/auth/oauth");
  });

  it("never redirects to a URL that is not the provider's", async () => {
    fetchMock.mockResolvedValue(json(200, { url: "https://evil.example/phish", state: STATE }));
    const res = await formPost("oauth/google/start", {});
    expect(location(res)).toBe("/sign-in?oauth_error=OAUTH_FAILED");
    expect(setCookies(res).some((c) => c.startsWith("wb_oauth="))).toBe(false);
  });

  it("an off-site redirect_url is sent as /dashboard; API errors come back to the sign-in page", async () => {
    fetchMock.mockResolvedValue(json(404, { error: { code: "FEATURE_DISABLED" } }));
    const res = await formPost("oauth/facebook/start", { redirect_url: "https://evil.example" });
    expect(sentBody().redirectUrl).toBe("/dashboard");
    expect(location(res)).toBe("/sign-in?oauth_error=FEATURE_DISABLED");
  });

  it("link: needs a session; sends its access token as Bearer", async () => {
    const noSession = await formPost("oauth/google/start", { intent: "link" });
    expect(location(noSession)).toBe("/sign-in?redirect_url=%2Fsettings%2Fsecurity");
    expect(fetchMock).not.toHaveBeenCalled();

    const at = jwt(Math.floor(Date.now() / 1000) + 600);
    fetchMock.mockResolvedValue(json(200, { url: "https://accounts.google.com/x", state: STATE }));
    const res = await formPost("oauth/google/start", { intent: "link" }, { cookie: `wb_at=${at}` });
    expect(res.status).toBe(303);
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["authorization"]).toBe(`Bearer ${at}`);
    expect(sentBody().intent).toBe("link");
    expect(setCookies(res).find((c) => c.startsWith("wb_oauth="))).toContain(`link%3A${STATE}`);
  });
});

describe("BFF: oauth callback", () => {
  const bound = (intent = "signin") => `wb_oauth=${intent}:${STATE}`;
  const cb = (query: string, cookie?: string, provider = "google") => get(`oauth/${provider}/callback`, query, cookie);

  it("no state cookie or a different state: OAUTH_STATE_INVALID, code never sent", async () => {
    expect(location(await cb(`?code=c&state=${STATE}`))).toBe("/sign-in?oauth_error=OAUTH_STATE_INVALID");
    expect(location(await cb(`?code=c&state=${"T".repeat(43)}`, bound()))).toBe("/sign-in?oauth_error=OAUTH_STATE_INVALID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("provider error or cancel: CANCELLED, back where the flow started", async () => {
    expect(location(await cb("?error=access_denied", bound()))).toBe("/sign-in?oauth_error=CANCELLED");
    expect(location(await cb("?error=access_denied", bound("link")))).toBe("/settings/security?oauth_error=CANCELLED");
  });

  it("session: tokens only in httpOnly cookies; new account goes to business details", async () => {
    fetchMock.mockResolvedValue(
      json(200, { result: "session", accessToken: "AT", refreshToken: "RT", deviceId: "DEV", needsWorkspace: true, redirectUrl: "/inbox" }),
    );
    const res = await cb(`?code=thecode&state=${STATE}`, bound());
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/business-details");
    expect(sentBody()).toEqual({ code: "thecode", state: STATE, client: "web" });
    const cookies = setCookies(res);
    for (const name of ["wb_rt=RT", "wb_at=AT", "wb_dev=DEV"]) {
      const c = cookies.find((x) => x.startsWith(name))!;
      expect(c).toMatch(/HttpOnly/i);
    }
    expect(cookies.find((c) => c.startsWith("wb_oauth="))).toMatch(/Max-Age=0/);
    expect(res.headers.get("location")).not.toContain("AT");
  });

  it("session for an existing workspace goes to the saved redirect", async () => {
    fetchMock.mockResolvedValue(json(200, { result: "session", accessToken: "AT", refreshToken: "RT", needsWorkspace: false, redirectUrl: "/inbox" }));
    expect(location(await cb(`?code=c&state=${STATE}`, bound()))).toBe("/inbox");
  });

  it("linked: back to Security settings", async () => {
    fetchMock.mockResolvedValue(json(200, { result: "linked", provider: "facebook" }));
    expect(location(await cb(`?code=c&state=${STATE}`, bound("link"), "facebook"))).toBe("/settings/security?linked=facebook");
  });

  it("confirm_email: pending id in an httpOnly cookie, not the URL", async () => {
    fetchMock.mockResolvedValue(json(200, { result: "confirm_email", pendingId: "PEND", provider: "facebook", email: "an***@x.com" }));
    const res = await cb(`?code=c&state=${STATE}`, bound(), "facebook");
    expect(location(res)).toBe("/sign-in/confirm-email?provider=facebook&email=an***%40x.com");
    expect(res.headers.get("location")).not.toContain("PEND");
    const c = setCookies(res).find((x) => x.startsWith("wb_oauth_pending="))!;
    expect(c).toContain("wb_oauth_pending=PEND");
    expect(c).toMatch(/HttpOnly/i);
  });

  it("API errors carry the code and the API's intent", async () => {
    fetchMock.mockResolvedValue(json(409, { error: { code: "OAUTH_ALREADY_LINKED" }, intent: "link" }));
    expect(location(await cb(`?code=c&state=${STATE}`, bound("link")))).toBe("/settings/security?oauth_error=OAUTH_ALREADY_LINKED");
    fetchMock.mockRejectedValue(new Error("down"));
    expect(location(await cb(`?code=c&state=${STATE}`, bound()))).toBe("/sign-in?oauth_error=UNAVAILABLE");
  });
});

describe("BFF: pending email confirmation", () => {
  it("without the pending cookie: 400 OAUTH_EXPIRED, no upstream call", async () => {
    const res = await jsonPost("oauth/pending/send", {});
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("OAUTH_EXPIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("send: pending id from the cookie only; email passed through", async () => {
    fetchMock.mockResolvedValue(json(202, { ok: true }));
    const res = await jsonPost("oauth/pending/send", { email: "n@x.com", pendingId: "FORGED" }, "wb_oauth_pending=PEND");
    expect(res.status).toBe(202);
    expect(sentBody()).toEqual({ pendingId: "PEND", email: "n@x.com" });
  });

  it("verify: sets session cookies, clears the pending cookie, returns only the destination", async () => {
    fetchMock.mockResolvedValue(json(200, { result: "session", accessToken: "AT", refreshToken: "RT", deviceId: "DEV", needsWorkspace: true }));
    const res = await jsonPost("oauth/pending/verify", { code: "123456" }, "wb_oauth_pending=PEND");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ redirectTo: "/business-details" });
    expect(sentBody()).toEqual({ pendingId: "PEND", code: "123456", client: "web" });
    const cookies = setCookies(res);
    expect(cookies.some((c) => c.startsWith("wb_rt=RT"))).toBe(true);
    expect(cookies.find((c) => c.startsWith("wb_oauth_pending="))).toMatch(/Max-Age=0/);
  });

  it("verify failure passes the error through without tokens", async () => {
    fetchMock.mockResolvedValue(json(400, { error: { code: "INVALID_CODE", message: "bad" } }));
    const res = await jsonPost("oauth/pending/verify", { code: "1" }, "wb_oauth_pending=PEND");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "INVALID_CODE", message: "bad" } });
  });
});

describe("BFF: WhatsApp sign-in", () => {
  it("request is forwarded as is; verify adds client=web and sets cookies", async () => {
    fetchMock.mockResolvedValueOnce(json(202, { ok: true }));
    expect((await jsonPost("sign-in/whatsapp/request", { phone: "+91 87795 06101" })).status).toBe(202);
    expect(sentBody(0)).toEqual({ phone: "+91 87795 06101" });

    fetchMock.mockResolvedValueOnce(json(200, { accessToken: "AT", refreshToken: "RT", deviceId: "DEV", expiresIn: 600 }));
    const res = await jsonPost("sign-in/whatsapp/verify", { phone: "+918779506101", code: "123456", client: "mobile" });
    expect(sentBody(1)).toEqual({ phone: "+918779506101", code: "123456", client: "web" });
    expect(await res.json()).toEqual({ expiresIn: 600 });
    expect(setCookies(res).some((c) => c.startsWith("wb_rt=RT"))).toBe(true);
  });
});
