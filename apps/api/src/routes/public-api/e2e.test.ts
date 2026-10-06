/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory Prisma fake is intentionally loosely typed */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { UnrecoverableError } from "bullmq";
import { randomBytes, randomUUID } from "node:crypto";

// ---- in-memory fake Prisma + recording queues (hoisted: vi.mock factories may not touch top-level consts) ----
const h = vi.hoisted(() => {
  type Row = Record<string, any>;
  const t = {
    organization: new Map<string, Row>(),
    vendorSetting: [] as Row[],
    apiKey: new Map<string, Row>(),
    contact: new Map<string, Row>(),
    conversation: new Map<string, Row>(),
    message: new Map<string, Row>(),
    apiMessageMeta: new Map<string, Row>(),
  };
  const sendJobs: Array<{ name: string; data: any; opts: any }> = [];
  const callbackJobs: Array<{ name: string; data: any }> = [];
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;

  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) => (v !== null && typeof v === "object" && !(v instanceof Date) ? true : row[k] === v));

  const fake: any = {
    organization: { findUnique: async ({ where }: any) => t.organization.get(where.id) ?? null },
    vendorSetting: {
      findFirst: async ({ where }: any) => t.vendorSetting.find((r) => r.organizationId === where.organizationId && r.key === where.key) ?? null,
    },
    apiKey: {
      findUnique: async ({ where }: any) => t.apiKey.get(where.id) ?? null,
      update: async ({ where, data }: any) => Object.assign(t.apiKey.get(where.id)!, data),
    },
    template: { findMany: async () => [] },
    contact: {
      upsert: async ({ where, create }: any) => {
        const { organizationId, phoneNumber } = where.organizationId_phoneNumber;
        const found = [...t.contact.values()].find((r) => r.organizationId === organizationId && r.phoneNumber === phoneNumber);
        if (found) return found;
        const c: Row = { id: id("contact"), ...create };
        t.contact.set(c['id'], c);
        return c;
      },
    },
    conversation: {
      findFirst: async ({ where }: any) => [...t.conversation.values()].find((r) => matches(r, where)) ?? null,
      create: async ({ data }: any) => { const c = { id: id("conv"), ...data }; t.conversation.set(c.id, c); return c; },
      update: async ({ where, data }: any) => Object.assign(t.conversation.get(where.id)!, data),
    },
    message: {
      create: async ({ data }: any) => { const m = { id: randomUUID(), whatsappMessageId: null, sentAt: null, ...data }; t.message.set(m.id, m); return m; },
      findFirst: async ({ where }: any) => [...t.message.values()].find((r) => matches(r, where)) ?? null,
      findUnique: async ({ where }: any) => t.message.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const m = t.message.get(where.id);
        if (!m || (where.organizationId && m.organizationId !== where.organizationId)) throw new Error("not found");
        return Object.assign(m, data);
      },
    },
    apiMessageMeta: {
      create: async ({ data }: any) => {
        const r = { callbackUrl: null, errorCode: null, lastStatus: null, sequence: 0, queuedAt: new Date(), sentAt: null, deliveryReportAt: null, ...data };
        t.apiMessageMeta.set(r.messageId, r);
        return r;
      },
      findUnique: async ({ where }: any) => t.apiMessageMeta.get(where.messageId) ?? null,
      updateMany: async ({ where, data }: any) => {
        const r = t.apiMessageMeta.get(where.messageId);
        if (!r || r.lastStatus !== where.lastStatus) return { count: 0 };
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === "object" && "increment" in (v as object)) r[k] += (v as { increment: number }).increment;
          else r[k] = v;
        }
        return { count: 1 };
      },
      findFirst: async ({ where, include }: any) => {
        const r = [...t.apiMessageMeta.values()].find((x) => matches(x, where));
        return r ? { ...r, ...(include?.message ? { message: t.message.get(r.messageId) } : {}) } : null;
      },
      findMany: async ({ where, include }: any) =>
        [...t.apiMessageMeta.values()].filter((x) => matches(x, where)).map((r) => ({ ...r, ...(include?.message ? { message: t.message.get(r.messageId) } : {}) })),
      count: async ({ where }: any) => [...t.apiMessageMeta.values()].filter((x) => matches(x, where)).length,
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(fake),
  };
  return { t, fake, sendJobs, callbackJobs, sendTextMessage: { fn: null as null | ((...a: unknown[]) => Promise<unknown>) } };
});

vi.mock("../../lib/prisma.js", () => ({ prisma: h.fake }));
vi.mock("../../lib/queue.js", () => ({ redisConnection: undefined }));
vi.mock("../../lib/io-ref.js", () => ({ getIo: () => undefined }));
vi.mock("../../lib/public-api/queues.js", () => ({
  publicApiSendQueue: { add: async (name: string, data: unknown, opts: unknown) => { h.sendJobs.push({ name, data, opts }); } },
  publicApiCallbackQueue: { add: async (name: string, data: unknown) => { h.callbackJobs.push({ name, data }); } },
}));
vi.mock("../../lib/whatsapp.js", async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const stub = (...a: unknown[]) => h.sendTextMessage.fn!(...a);
  return {
    ...real,
    sendTextMessage: stub,
    sendMediaMessage: stub,
    sendTemplateMessage: stub,
    sendInteractiveMessage: stub,
    sendLocationMessage: stub,
  };
});

import { publicApiRouter } from "./index.js";
import { processSendJob } from "../../workers/public-api-send.worker.js";
import { deliverCallback } from "../../workers/public-api-callbacks.worker.js";
import { signV2 } from "../../lib/public-api/plivo-signature.js";
import { newAuthToken, hashToken, encryptToken } from "../../lib/public-api/credentials.js";
import { WaApiError } from "../../lib/whatsapp.js";

const ORIG_KEY = process.env["PUBLIC_API_TOKEN_KEY"];
const ORIG_ALLOWED = process.env["PUBLIC_API_ALLOWED_ORGS"];
const CALLBACK_URL = "https://8.8.8.8/hooks/status"; // public IP literal: passes the SSRF guard with no DNS
const SRC = "14155552671";
const DST = "14155552672";

interface Cred { authId: string; token: string }

function seedOrg(orgId: string, cred: Cred) {
  h.t.organization.set(orgId, { id: orgId, status: "active", phoneNumberId: `pn-${orgId}`, wabaAccessToken: `waba-secret-${orgId}` });
  h.t.vendorSetting.push(
    { organizationId: orgId, key: "current_phone_number_number", value: "+1 415-555-2671" }
  );
  h.t.apiKey.set(cred.authId, {
    id: cred.authId, organizationId: orgId, keyHash: hashToken(cred.token), tokenEnc: encryptToken(cred.token),
    revokedAt: null, lastUsedAt: new Date(), callbackUrl: CALLBACK_URL, inboundUrl: null,
  });
}

const basic = (c: Cred) => `Basic ${Buffer.from(`${c.authId}:${c.token}`).toString("base64")}`;

describe("public API end-to-end (real router + workers, in-memory Prisma)", () => {
  let app: FastifyInstance;
  let cred1: Cred;
  let cred2: Cred;

  const post = (c: Cred) =>
    app.inject({
      method: "POST", url: `/v1/Account/${c.authId}/Message/`, headers: { authorization: basic(c) },
      payload: { src: `+${SRC}`, dst: `+${DST}`, type: "whatsapp", text: "hello e2e" },
    });

  const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    return { ok: true, status: 200 } as Response;
  }) as unknown as typeof fetch;

  beforeEach(async () => {
    process.env["PUBLIC_API_TOKEN_KEY"] = randomBytes(32).toString("base64");
    for (const m of Object.values(h.t)) Array.isArray(m) ? (m.length = 0) : m.clear();
    delete process.env["PUBLIC_API_ALLOWED_ORGS"];
    h.sendJobs.length = 0; h.callbackJobs.length = 0; fetchCalls.length = 0;
    h.sendTextMessage.fn = async () => ({ messageId: "wamid.E2E" });

    cred1 = { authId: "ak-org1", token: newAuthToken() };
    cred2 = { authId: "ak-org2", token: newAuthToken() };
    seedOrg("org-1", cred1);
    seedOrg("org-2", cred2);

    app = Fastify({ logger: false });
    app.decorate("prisma", h.fake as unknown as PrismaClient);
    await app.register(publicApiRouter, { prefix: "/v1/Account/:authId" });
  });
  afterEach(async () => {
    await app.close();
    if (ORIG_ALLOWED === undefined) delete process.env["PUBLIC_API_ALLOWED_ORGS"]; else process.env["PUBLIC_API_ALLOWED_ORGS"] = ORIG_ALLOWED;
  });
  afterAll(() => {
    if (ORIG_KEY === undefined) delete process.env["PUBLIC_API_TOKEN_KEY"]; else process.env["PUBLIC_API_TOKEN_KEY"] = ORIG_KEY;
  });

  const form = (init: RequestInit) => new URLSearchParams(String(init.body));

  it("queued -> sent: accepts the send, runs the worker, and delivers signed, ordered callbacks", async () => {
    const res = await post(cred1);
    expect(res.statusCode).toBe(202);
    const uuid = (res.json() as { message_uuid: string[] }).message_uuid[0]!;
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(h.sendJobs).toHaveLength(1);
    expect(h.callbackJobs).toHaveLength(1);
    expect(h.callbackJobs[0]!.data.fields).toMatchObject({ MessageUUID: uuid, Status: "queued", Sequence: "1" });

    await processSendJob({ data: h.sendJobs[0]!.data });
    expect(h.t.message.get(uuid)!.status).toBe("sent");
    expect(h.callbackJobs).toHaveLength(2);
    expect(h.callbackJobs[1]!.data.fields).toMatchObject({ Status: "sent", Sequence: "2" });
    expect(Number(h.callbackJobs[1]!.data.fields["Sequence"])).toBeGreaterThan(Number(h.callbackJobs[0]!.data.fields["Sequence"]));

    for (const job of h.callbackJobs) await deliverCallback({ data: job.data }, fakeFetch);
    expect(fetchCalls).toHaveLength(2);
    const statuses: string[] = [];
    for (const { url, init } of fetchCalls) {
      expect(url).toBe(CALLBACK_URL);
      const headers = init.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(headers["X-Plivo-Signature-V2"]).toBe(signV2(url, headers["X-Plivo-Signature-V2-Nonce"]!, cred1.token));
      const body = form(init);
      expect(body.get("MessageUUID")).toBe(uuid);
      statuses.push(body.get("Status")!);
    }
    expect(statuses).toEqual(["queued", "sent"]);

    // revoking the credential stops delivery and authentication
    h.t.apiKey.get(cred1.authId)!.revokedAt = new Date();
    fetchCalls.length = 0;
    await expect(deliverCallback({ data: h.callbackJobs[0]!.data }, fakeFetch)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(fetchCalls).toHaveLength(0);
    expect((await post(cred1)).statusCode).toBe(401);
  });

  it("maps a Meta 131047 rejection to a failed message and a failed callback with ErrorCode=380", async () => {
    const res = await post(cred1);
    const uuid = (res.json() as { message_uuid: string[] }).message_uuid[0]!;
    h.sendTextMessage.fn = async () => { throw new WaApiError("re-engagement", 131047, null); };

    await processSendJob({ data: h.sendJobs[0]!.data });
    expect(h.t.message.get(uuid)!.status).toBe("failed");
    const last = h.callbackJobs.at(-1)!.data.fields;
    expect(last).toMatchObject({ MessageUUID: uuid, Status: "failed", ErrorCode: "380", Sequence: "2" });
  });

  it("isolates tenants: a second org cannot read or list the first org's message", async () => {
    const uuid = ((await post(cred1)).json() as { message_uuid: string[] }).message_uuid[0]!;

    const own = await app.inject({ method: "GET", url: `/v1/Account/${cred1.authId}/Message/${uuid}/`, headers: { authorization: basic(cred1) } });
    expect(own.statusCode).toBe(200);

    const other = await app.inject({ method: "GET", url: `/v1/Account/${cred2.authId}/Message/${uuid}/`, headers: { authorization: basic(cred2) } });
    expect(other.statusCode).toBe(404);

    const list = await app.inject({ method: "GET", url: `/v1/Account/${cred2.authId}/Message/`, headers: { authorization: basic(cred2) } });
    expect(list.statusCode).toBe(200);
    const json = list.json() as { objects: unknown[]; meta: { total_count: number } };
    expect(json.objects).toEqual([]);
    expect(json.meta.total_count).toBe(0);
  });

  it("an org with no plan setting can create a credential through the dashboard route and send with it", async () => {
    const { apiCredentialsRouter } = await import("../api-credentials.js");
    const dash = Fastify({ logger: false });
    const prisma = {
      ...h.fake,
      apiKey: {
        ...h.fake.apiKey,
        count: async () => 0,
        create: async ({ data }: any) => { const r = { id: "ak-new", revokedAt: null, lastUsedAt: null, ...data }; h.t.apiKey.set(r.id, r); return r; },
      },
    };
    (prisma as any).adminAuditLog = { create: async () => ({}) };
    dash.decorate("prisma", prisma as unknown as PrismaClient);
    dash.addHook("onRequest", async (r) => { r.auth = { userId: "u-1", organizationId: "org-1", role: "admin", permissions: {}, teamId: null, teamRole: null } as never; });
    await dash.register(apiCredentialsRouter, { prefix: "/v1" });
    expect(h.t.vendorSetting.some((r) => r.key === "plan_feature_api_access")).toBe(false);
    const created = await dash.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "New" } });
    await dash.close();
    expect(created.statusCode).toBe(201);
    const { authId, authToken } = created.json<{ data: { authId: string; authToken: string } }>().data;
    expect((await post({ authId, token: authToken })).statusCode).toBe(202);
  });

  it("PUBLIC_API_ALLOWED_ORGS gates the public API: 403 for an unlisted org, success once the org is listed", async () => {
    process.env["PUBLIC_API_ALLOWED_ORGS"] = "org-2";
    expect((await post(cred1)).statusCode).toBe(403);
    process.env["PUBLIC_API_ALLOWED_ORGS"] = " org-9 , org-1 ";
    expect((await post(cred1)).statusCode).toBe(202);
  });

  it("a blocked org's existing credential stops working immediately", async () => {
    expect((await post(cred1)).statusCode).toBe(202);
    h.t.vendorSetting.push({ organizationId: "org-1", key: "plan_feature_public_api_blocked", value: "1" });
    expect((await post(cred1)).statusCode).toBe(403);
    expect((await post(cred2)).statusCode).toBe(202); // other orgs unaffected
  });
});
