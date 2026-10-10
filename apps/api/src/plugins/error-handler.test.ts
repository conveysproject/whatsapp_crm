import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }));
vi.mock("@sentry/node", () => sentry);

import errorHandlerPlugin from "./error-handler.js";

const SECRET = "SELECT secret FROM users -- 919876543210";
const GENERIC = { error: { code: "INTERNAL_ERROR", message: "Internal server error" } };

const routes: FastifyPluginAsync = async (f) => {
  f.get("/boom", async () => { throw new Error(SECRET); });
  f.get("/boom503", async () => { throw Object.assign(new Error(SECRET), { statusCode: 503 }); });
  f.get("/notfound", async () => { throw Object.assign(new Error("nope"), { statusCode: 404 }); });
  f.get("/limited", async (_req, reply) => {
    reply.header("retry-after", "7");
    throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429 });
  });
  f.get("/string", async () => { throw SECRET; });
  f.post("/validate", {
    schema: { body: { type: "object", required: ["name"], properties: { name: { type: "string" } } } },
  }, async () => ({ ok: true }));
};

const childOverride: FastifyPluginAsync = async (f) => {
  f.setErrorHandler((_e, _r, reply) => { void reply.status(500).send({ error_code: "INTERNAL_ERROR", api_id: "abc" }); });
  f.get("/boom", async () => { throw new Error(SECRET); });
};

let logLines: string[];
const stream = { write: (s: string) => { logLines.push(s); } };

async function build(withHandler: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: "error", stream } });
  if (withHandler) await app.register(errorHandlerPlugin);
  await app.register(routes);
  await app.register(childOverride, { prefix: "/child" });
  await app.ready();
  return app;
}

describe("global error handler", () => {
  let app: FastifyInstance;
  let control: FastifyInstance;

  beforeEach(async () => {
    logLines = [];
    sentry.captureException.mockClear();
    delete process.env["SENTRY_DSN"];
    app = await build(true);
    control = await build(false);
    logLines = [];
  });
  afterEach(async () => {
    await app.close();
    await control.close();
    delete process.env["SENTRY_DSN"];
  });

  it("(a) unexpected error: generic 500, no leak in body or headers, error logged server-side", async () => {
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual(GENERIC);
    expect(res.body).not.toContain("SELECT");
    expect(res.body).not.toContain("919876543210");
    expect(JSON.stringify(res.headers)).not.toContain("919876543210");
    expect(JSON.stringify(res.headers)).not.toContain("SELECT");
    const logged = logLines.map((l) => JSON.parse(l)).find((l) => l.msg === "unhandled error");
    expect(logged).toBeDefined();
    expect(logged.err.message).toBe(SECRET);
  });

  it("(b) 5xx keeps its original status code but gets the generic body", async () => {
    const res = await app.inject({ method: "GET", url: "/boom503" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual(GENERIC);
    expect(res.body).not.toContain("SELECT");
  });

  it("(c1) schema validation failure is identical to the default handler", async () => {
    const a = await app.inject({ method: "POST", url: "/validate", payload: {} });
    const c = await control.inject({ method: "POST", url: "/validate", payload: {} });
    expect(a.statusCode).toBe(400);
    expect(a.statusCode).toBe(c.statusCode);
    expect(a.headers["content-type"]).toBe(c.headers["content-type"]);
    expect(a.json()).toEqual(c.json());
  });

  it("(c2) thrown 404 is identical to the default handler", async () => {
    const a = await app.inject({ method: "GET", url: "/notfound" });
    const c = await control.inject({ method: "GET", url: "/notfound" });
    expect(a.statusCode).toBe(404);
    expect(a.statusCode).toBe(c.statusCode);
    expect(a.headers["content-type"]).toBe(c.headers["content-type"]);
    expect(a.json()).toEqual(c.json());
    expect(a.json()).toEqual({ statusCode: 404, error: "Not Found", message: "nope" });
  });

  it("(c3) 429 with retry-after is identical to the default handler and keeps the header", async () => {
    const a = await app.inject({ method: "GET", url: "/limited" });
    const c = await control.inject({ method: "GET", url: "/limited" });
    expect(a.statusCode).toBe(429);
    expect(a.statusCode).toBe(c.statusCode);
    expect(a.headers["content-type"]).toBe(c.headers["content-type"]);
    expect(a.headers["retry-after"]).toBe("7");
    expect(a.headers["retry-after"]).toBe(c.headers["retry-after"]);
    expect(a.json()).toEqual(c.json());
  });

  it("(d) async route rejecting with a string yields the generic 500", async () => {
    const res = await app.inject({ method: "GET", url: "/string" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual(GENERIC);
    expect(res.body).not.toContain("919876543210");
  });

  it("(e) Sentry: nothing captured without a DSN", async () => {
    await app.inject({ method: "GET", url: "/boom" });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("(e) Sentry: with a DSN, captured once for 5xx and never for 4xx", async () => {
    process.env["SENTRY_DSN"] = "https://test@sentry.io/1";
    await app.inject({ method: "GET", url: "/boom" });
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException.mock.calls[0]![0]).toBeInstanceOf(Error);
    sentry.captureException.mockClear();
    await app.inject({ method: "GET", url: "/notfound" });
    await app.inject({ method: "GET", url: "/limited" });
    await app.inject({ method: "POST", url: "/validate", payload: {} });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("(f) a child plugin's own error handler overrides the global one", async () => {
    const res = await app.inject({ method: "GET", url: "/child/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error_code: "INTERNAL_ERROR", api_id: "abc" });
  });
});
