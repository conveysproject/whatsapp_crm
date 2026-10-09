# Public API Payload Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the request body, response body and callback delivery attempts of public API calls (redacted, capped, 365 days), let a client's org admins read their own records in API Usage, and give staff a read-only audited lookup script.

**Architecture:** Payload fields ride on the existing buffered, never-throws usage recorder. Rows are written in the same flush transaction as `api_request_logs`, keyed by the per-request `api_id` (set by the clear-errors plan). The payload table is self-contained (own summary columns, own 365-day cleanup), because request-log metadata is deleted at 30 days. Everything is behind `API_PAYLOAD_LOGGING_ENABLED` (default off).

**Tech Stack:** TypeScript, Fastify, Prisma 7 + `@prisma/adapter-pg`, BullMQ, Next.js (apps/web), Vitest.

**Spec:** `docs/prd-public-api-request-payload-logging.md` (sections 4, 6, 7). Depends on `docs/superpowers/plans/2026-10-09-public-api-clear-errors.md` Task 1 (`request.apiId`).

## Global Constraints

- Retention: 365 days (`API_PAYLOAD_RETENTION_DAYS`, default 365, floor 90 because the owner asked for at least 3 months). Metadata (`api_request_logs`) stays at 30 days; `api_usage_daily` stays forever.
- Caps: each stored body at most 16384 characters (flag `*_truncated`); in-memory payload buffer at most 20 MB (excess payloads are dropped, the metadata event is kept).
- Never stored: `Authorization` header, any JSON key matching `/token|secret|authorization|password|api[_-]?key/i` (value replaced by `[redacted]`), query strings of URL values (`?[redacted]`), callback signatures/nonces.
- Payloads are stored only for requests with an organization (no payloads for unauthenticated floods) and only when the raw log row is written (same sampling and 401 cap).
- Org scoping on every dashboard query: `organization_id = request.auth.organizationId`; RBAC `settings_api_key` plus API availability, same gate as `routes/api-usage.ts:71-80`.
- A recording/DB failure must never change an API response.
- Migrations are hand-authored additive SQL (local DB is drifted; `prisma migrate dev` fails). After applying on prod by any out-of-band means, run `prisma migrate resolve --applied <name>`.
- Production steps (flag on, migration deploy) need owner confirmation; Claude does not write Railway variables.
- Tests run with: `cd apps/api && pnpm vitest run <path>`; web with `cd apps/web && pnpm vitest run <path>`.

## Review Focus

- The `Authorization` header and any `*token*` field never appear in a stored row (test with a body containing `auth_token`, and a response containing a signed media URL).
- Org A can never read org B's payload by id (404, not 403), nor list it.
- Flag off: no rows, no extra memory, identical API responses.
- A 17 KB body is stored truncated and flagged; invalid JSON bodies (parse failure) store a null request body and still log the response.
- Payload buffer overflow drops payloads, not metering events.
- Callback attempt rows exist for delivered, HTTP error, network error and dropped outcomes, with the HTTP status.

---

## File Structure

- Create `apps/api/prisma/migrations/20261009000000_api_payload_logging/migration.sql`; modify `apps/api/prisma/schema.prisma` (3 models).
- Create `apps/api/src/lib/public-api/payload-capture.ts` (+ test): redaction, caps, snapshot.
- Modify `apps/api/src/lib/public-api/usage.ts` (+ test): event fields, buffer budget, flush.
- Modify `apps/api/src/routes/public-api/index.ts`, `apps/api/src/types/fastify.d.ts`: `onSend` capture, pass snapshot.
- Create `apps/api/src/lib/public-api/callback-attempts.ts` (+ test); modify `apps/api/src/workers/public-api-callbacks.worker.ts`.
- Create `apps/api/src/lib/public-api/payload-cleanup.ts` (+ test); modify `apps/api/src/workers/message-cleanup.ts:17-21`.
- Modify `apps/api/src/routes/api-usage.ts` (+ test): three read endpoints.
- Create `apps/web/components/settings/api-usage/RequestHistory.tsx`, `CallbackAttempts.tsx`; modify `apps/web/lib/api-usage.ts`, `apps/web/app/(dashboard)/settings/api-usage/page.tsx`.
- Create `apps/api/scripts/lookup-api-request.ts`.
- Modify `.env.example`, `docs/prd-public-api-request-payload-logging.md` (section 4 now self-contained tables).

---

### Task 1: Migration and Prisma models

**Files:**
- Create: `apps/api/prisma/migrations/20261009000000_api_payload_logging/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (append after `ApiUsageDaily`)

- [ ] **Step 1: Write the migration**

```sql
-- Public API payload logging. Additive only. No foreign keys (credentials are soft-revoked; history must survive).

CREATE TABLE "api_request_payloads" (
    "id" TEXT NOT NULL,                       -- equals the api_id returned to the client
    "organization_id" TEXT NOT NULL,
    "api_key_id" TEXT,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "error_class" TEXT,
    "error_code" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "request_body" TEXT,
    "response_body" TEXT,
    "request_truncated" BOOLEAN NOT NULL DEFAULT false,
    "response_truncated" BOOLEAN NOT NULL DEFAULT false,
    "query_string" TEXT,
    "client_ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_request_payloads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "api_request_payloads_org_created_idx" ON "api_request_payloads"("organization_id", "created_at");
CREATE INDEX "api_request_payloads_key_created_idx" ON "api_request_payloads"("api_key_id", "created_at");
CREATE INDEX "api_request_payloads_created_idx" ON "api_request_payloads"("created_at");

CREATE TABLE "api_callback_attempts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "message_id" TEXT,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "outcome" TEXT NOT NULL,                  -- delivered | http_error | network_error | dropped
    "http_status" INTEGER,
    "reason" TEXT,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_callback_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "api_callback_attempts_org_created_idx" ON "api_callback_attempts"("organization_id", "created_at");
CREATE INDEX "api_callback_attempts_message_idx" ON "api_callback_attempts"("organization_id", "message_id");
CREATE INDEX "api_callback_attempts_created_idx" ON "api_callback_attempts"("created_at");

CREATE TABLE "api_payload_access_audit" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "rows_returned" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_payload_access_audit_pkey" PRIMARY KEY ("id")
);
```

- [ ] **Step 2: Add the Prisma models** (append to `schema.prisma`)

```prisma
model ApiRequestPayload {
  id               String   @id
  organizationId   String   @map("organization_id")
  apiKeyId         String?  @map("api_key_id")
  method           String
  endpoint         String
  statusCode       Int      @map("status_code")
  outcome          String
  errorClass       String?  @map("error_class")
  errorCode        String?  @map("error_code")
  durationMs       Int      @map("duration_ms")
  requestBody      String?  @map("request_body")
  responseBody     String?  @map("response_body")
  requestTruncated Boolean  @default(false) @map("request_truncated")
  responseTruncated Boolean @default(false) @map("response_truncated")
  queryString      String?  @map("query_string")
  clientIp         String?  @map("client_ip")
  userAgent        String?  @map("user_agent")
  createdAt        DateTime @default(now()) @map("created_at")

  @@index([organizationId, createdAt], map: "api_request_payloads_org_created_idx")
  @@index([apiKeyId, createdAt], map: "api_request_payloads_key_created_idx")
  @@index([createdAt], map: "api_request_payloads_created_idx")
  @@map("api_request_payloads")
}

model ApiCallbackAttempt {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  apiKeyId       String   @map("api_key_id")
  messageId      String?  @map("message_id")
  url            String
  method         String
  fields         Json
  attempt        Int      @default(1)
  outcome        String
  httpStatus     Int?     @map("http_status")
  reason         String?
  durationMs     Int      @default(0) @map("duration_ms")
  createdAt      DateTime @default(now()) @map("created_at")

  @@index([organizationId, createdAt], map: "api_callback_attempts_org_created_idx")
  @@index([organizationId, messageId], map: "api_callback_attempts_message_idx")
  @@index([createdAt], map: "api_callback_attempts_created_idx")
  @@map("api_callback_attempts")
}

model ApiPayloadAccessAudit {
  id             String   @id @default(uuid())
  actor          String
  organizationId String   @map("organization_id")
  reason         String
  query          String
  rowsReturned   Int      @default(0) @map("rows_returned")
  createdAt      DateTime @default(now()) @map("created_at")

  @@map("api_payload_access_audit")
}
```

- [ ] **Step 3: Generate the client and type-check**

Run: `cd apps/api && pnpm prisma generate && pnpm tsc --noEmit`
Expected: no errors. (Do NOT run `prisma migrate dev`; it fails on the drifted local DB.)

- [ ] **Step 4: Verify the SQL on a throwaway Postgres**

Run the real-Postgres pattern from `apps/api/scripts/smoke-usage-tracking.ts` (docker `postgres:16` on port 55432, a `smoke*` database) and execute the migration file with `psql -f`. Expected: all statements succeed; re-running fails with "already exists" (proving it is not idempotent but additive).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): tables for public API payload logging and callback attempts"
```

---

### Task 2: Payload capture library

**Files:**
- Create: `apps/api/src/lib/public-api/payload-capture.ts`, `payload-capture.test.ts`

**Interfaces:**
- Produces:
  - `payloadLoggingEnabled(): boolean` (true only when `process.env.API_PAYLOAD_LOGGING_ENABLED === "true"`)
  - `redactValue(v: unknown): unknown`
  - `capText(text: string, max?: number): { text: string; truncated: boolean }`
  - `interface PayloadSnapshot { requestBody: string | null; responseBody: string | null; requestTruncated: boolean; responseTruncated: boolean; queryString: string | null; clientIp: string | null; userAgent: string | null; errorCode: string | null }`
  - `buildPayloadSnapshot(input: { body: unknown; url: string; responseText: string | undefined; clientIp: string | null; userAgent: string | undefined }): PayloadSnapshot`
  - `payloadSize(p: PayloadSnapshot): number`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { buildPayloadSnapshot, capText, payloadLoggingEnabled, payloadSize, redactValue } from "./payload-capture.js";

describe("redactValue", () => {
  it("redacts secret-looking keys at any depth and keeps normal fields", () => {
    const out = redactValue({ text: "hi", auth_token: "abc", nested: { Authorization: "Basic x", password: "p", keep: 1 }, list: [{ apiKey: "k" }] });
    expect(out).toEqual({ text: "hi", auth_token: "[redacted]", nested: { Authorization: "[redacted]", password: "[redacted]", keep: 1 }, list: [{ apiKey: "[redacted]" }] });
  });
  it("strips query strings from URL values", () => {
    expect(redactValue({ media_urls: ["https://cdn.example.com/a.png?sig=SECRET&x=1"] })).toEqual({ media_urls: ["https://cdn.example.com/a.png?[redacted]"] });
  });
  it("bounds depth and array size", () => {
    const deep: Record<string, unknown> = {}; let cur = deep;
    for (let i = 0; i < 20; i++) { const n = {}; cur["a"] = n; cur = n as Record<string, unknown>; }
    expect(JSON.stringify(redactValue(deep))).toContain("[too deep]");
    expect((redactValue(Array.from({ length: 500 }, (_, i) => i)) as unknown[]).length).toBe(200);
  });
});

describe("capText", () => {
  it("leaves short text and cuts long text with a flag", () => {
    expect(capText("abc", 10)).toEqual({ text: "abc", truncated: false });
    expect(capText("a".repeat(20), 10)).toEqual({ text: "a".repeat(10), truncated: true });
  });
});

describe("buildPayloadSnapshot", () => {
  const base = { url: "/v1/Account/AUTHID/Message/?limit=5&token=zzz", clientIp: "203.0.113.9", userAgent: "curl/8" };
  it("stores redacted JSON for body and response, the error_code and a redacted query string", () => {
    const s = buildPayloadSnapshot({ ...base, body: { dst: "1", auth_token: "t" }, responseText: JSON.stringify({ api_id: "x", error: "bad", error_code: "VALIDATION_FAILED" }) });
    expect(s.requestBody).toBe(JSON.stringify({ dst: "1", auth_token: "[redacted]" }));
    expect(s.errorCode).toBe("VALIDATION_FAILED");
    expect(s.queryString).toBe("limit=5&token=[redacted]");
    expect(s.userAgent).toBe("curl/8");
  });
  it("a 17 KB body is truncated and flagged; a missing body is null", () => {
    const s = buildPayloadSnapshot({ ...base, body: { text: "x".repeat(17_000) }, responseText: undefined });
    expect(s.requestBody!.length).toBe(16384);
    expect(s.requestTruncated).toBe(true);
    expect(s.responseBody).toBeNull();
    expect(buildPayloadSnapshot({ ...base, body: undefined, responseText: undefined }).requestBody).toBeNull();
  });
  it("keeps a non-JSON response as redacted-agnostic text, capped", () => {
    expect(buildPayloadSnapshot({ ...base, body: undefined, responseText: "plain" }).responseBody).toBe("plain");
  });
  it("payloadSize counts both bodies", () => {
    const s = buildPayloadSnapshot({ ...base, body: { a: 1 }, responseText: "xy" });
    expect(payloadSize(s)).toBeGreaterThanOrEqual(s.requestBody!.length + 2);
  });
});

describe("payloadLoggingEnabled", () => {
  const prev = process.env["API_PAYLOAD_LOGGING_ENABLED"];
  afterEach(() => { if (prev === undefined) delete process.env["API_PAYLOAD_LOGGING_ENABLED"]; else process.env["API_PAYLOAD_LOGGING_ENABLED"] = prev; });
  it("is off unless exactly 'true'", () => {
    delete process.env["API_PAYLOAD_LOGGING_ENABLED"]; expect(payloadLoggingEnabled()).toBe(false);
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "1"; expect(payloadLoggingEnabled()).toBe(false);
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true"; expect(payloadLoggingEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/payload-capture.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
const SECRET_KEY = /token|secret|authorization|password|api[_-]?key/i;
const MAX_BODY_CHARS = 16384;
const MAX_STRING = 2000;
const MAX_DEPTH = 8;
const MAX_ITEMS = 200;

export function payloadLoggingEnabled(): boolean {
  return process.env["API_PAYLOAD_LOGGING_ENABLED"] === "true";
}

export function redactValue(v: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[too deep]";
  if (Array.isArray(v)) return v.slice(0, MAX_ITEMS).map((x) => redactValue(x, depth + 1));
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, MAX_ITEMS)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : redactValue(val, depth + 1);
    }
    return out;
  }
  if (typeof v === "string") {
    const noQuery = /^https?:\/\/\S*\?/.test(v) ? v.replace(/\?.*$/s, "?[redacted]") : v;
    return noQuery.length > MAX_STRING ? `${noQuery.slice(0, MAX_STRING)}…` : noQuery;
  }
  return v;
}

export function capText(text: string, max = MAX_BODY_CHARS): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

export interface PayloadSnapshot {
  requestBody: string | null;
  responseBody: string | null;
  requestTruncated: boolean;
  responseTruncated: boolean;
  queryString: string | null;
  clientIp: string | null;
  userAgent: string | null;
  errorCode: string | null;
}

function redactQuery(url: string): string | null {
  const i = url.indexOf("?");
  if (i === -1) return null;
  const params = new URLSearchParams(url.slice(i + 1));
  const parts: string[] = [];
  for (const [k, val] of params) parts.push(`${k}=${SECRET_KEY.test(k) ? "[redacted]" : val}`);
  return capText(parts.join("&"), 1000).text || null;
}

export function buildPayloadSnapshot(input: { body: unknown; url: string; responseText: string | undefined; clientIp: string | null; userAgent: string | undefined }): PayloadSnapshot {
  const req = input.body === undefined || input.body === null ? null : capText(JSON.stringify(redactValue(input.body)));
  let errorCode: string | null = null;
  let resText: string | null = null;
  if (input.responseText !== undefined) {
    try {
      const parsed = JSON.parse(input.responseText) as unknown;
      if (parsed && typeof parsed === "object" && typeof (parsed as { error_code?: unknown }).error_code === "string") errorCode = (parsed as { error_code: string }).error_code;
      resText = JSON.stringify(redactValue(parsed));
    } catch {
      resText = input.responseText;
    }
  }
  const res = resText === null ? null : capText(resText);
  return {
    requestBody: req?.text ?? null,
    responseBody: res?.text ?? null,
    requestTruncated: req?.truncated ?? false,
    responseTruncated: res?.truncated ?? false,
    queryString: redactQuery(input.url),
    clientIp: input.clientIp,
    userAgent: input.userAgent ? capText(input.userAgent, 200).text : null,
    errorCode,
  };
}

export function payloadSize(p: PayloadSnapshot): number {
  return (p.requestBody?.length ?? 0) + (p.responseBody?.length ?? 0) + 1024;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/payload-capture.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/public-api/payload-capture.ts apps/api/src/lib/public-api/payload-capture.test.ts
git commit -m "feat(api): redacting, capping payload snapshot builder"
```

---

### Task 3: Capture hooks and recorder flush

**Files:**
- Modify: `apps/api/src/lib/public-api/usage.ts:16-29,203-247,294-328`, `apps/api/src/routes/public-api/index.ts:36-69`, `apps/api/src/types/fastify.d.ts`
- Test: the existing usage recorder test file (find it with `ls apps/api/src/lib/public-api/usage*.test.ts`; follow its prisma-mock style), `apps/api/src/routes/public-api/usage-hook.test.ts`

**Interfaces:**
- Consumes: `PayloadSnapshot`, `buildPayloadSnapshot`, `payloadSize`, `payloadLoggingEnabled` (Task 2); `request.apiId` (clear-errors plan Task 1).
- Produces: `ApiRequestEvent` gains `logId?: string; payload?: PayloadSnapshot`. `request.apiResponseBody?: string` in `fastify.d.ts`.

- [ ] **Step 1: Write the failing tests**

In the recorder test file:

```ts
  it("writes a payload row with the event's logId in the same transaction as the raw row", async () => {
    const created = { logs: [] as any[], payloads: [] as any[] };
    const prisma = fakePrisma(created); // the file's existing fake: extend it so tx.apiRequestPayload.createMany pushes to created.payloads
    const snap = buildPayloadSnapshot({ body: { a: 1 }, url: "/x", responseText: '{"ok":1}', clientIp: null, userAgent: undefined });
    recordApiRequest({ method: "POST", routeUrl: "/v1/Account/:authId/Message/", statusCode: 400, durationMs: 5, requestId: "req-1", messages: 0,
      organizationId: "org-1", apiKeyId: "key-1", logId: "11111111-1111-4111-8111-111111111111", payload: snap });
    await flushApiUsage(prisma as never);
    expect(created.logs[0].id).toBe("11111111-1111-4111-8111-111111111111");
    expect(created.payloads[0]).toMatchObject({ id: "11111111-1111-4111-8111-111111111111", organizationId: "org-1", apiKeyId: "key-1", endpoint: "message.send", statusCode: 400, outcome: "client_error", requestBody: '{"a":1}' });
  });
  it("stores no payload for an event without an organization, or when the raw row is not written", async () => {
    // organizationId: null  -> created.payloads is empty
    // status 401 over the per-credential raw cap -> raw false -> no payload
  });
  it("drops payloads (not events) once the in-memory payload budget is spent", async () => {
    const big = { ...snap, requestBody: "x".repeat(16384), responseBody: "y".repeat(16384) };
    for (let i = 0; i < 700; i++) recordApiRequest({ ...ev(i), payload: big }); // > 20 MB
    await flushApiUsage(prisma as never);
    expect(created.logs.length).toBe(700);
    expect(created.payloads.length).toBeLessThan(700);
    expect(created.payloads.length).toBeGreaterThan(0);
  });
```

In `usage-hook.test.ts` (or `index.test.ts`), with `API_PAYLOAD_LOGGING_ENABLED=true`: an authenticated request produces a recorded event whose `payload.responseBody` contains the response `api_id` and whose `logId` equals the response `api_id`; with the flag unset the event has no `payload`.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/lib/public-api src/routes/public-api/usage-hook.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`usage.ts`:
- Import `type PayloadSnapshot, payloadSize` from `./payload-capture.js`.
- `ApiRequestEvent`: add `logId?: string; payload?: PayloadSnapshot;`.
- Near the constants add:

```ts
const MAX_PAYLOAD_BUFFER_BYTES = 20 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYLOAD_CHUNK = 200;
let payloadBytes = 0;
```

- In `recordApiRequest`, replace the `buffer.push({...})` call with:

```ts
    let payload = raw && event.organizationId ? event.payload : undefined;
    if (payload) {
      const size = payloadSize(payload);
      if (payloadBytes + size > MAX_PAYLOAD_BUFFER_BYTES) payload = undefined;
      else payloadBytes += size;
    }
    buffer.push({
      method: sanitizeMethod(event.method),
      routeUrl: typeof event.routeUrl === "string" ? event.routeUrl : undefined,
      statusCode: status,
      durationMs: Math.max(0, Math.round(num(event.durationMs))),
      requestId: sanitizeRequestId(event.requestId),
      messages: Math.max(0, Math.trunc(num(event.messages))),
      organizationId: event.organizationId ?? null,
      apiKeyId,
      ...(event.logId && UUID_RE.test(event.logId) ? { logId: event.logId } : {}),
      ...(payload ? { payload } : {}),
      at,
      raw,
    });
```

- In `flushBatch`, after `buffer = [];` add `payloadBytes = 0;`. Replace the `raws` construction `id: randomUUID(),` with `id: e.logId ?? randomUUID(),` and after `raws` add:

```ts
    const payloads = batch.filter((e) => e.raw && e.payload && e.organizationId).map((e) => ({
      id: e.logId ?? "",
      organizationId: e.organizationId as string,
      apiKeyId: e.apiKeyId ?? null,
      method: e.method,
      endpoint: endpointKey(e.method, e.routeUrl),
      statusCode: e.statusCode,
      outcome: outcomeFor(e.statusCode),
      errorClass: errorClassFor(e.statusCode),
      errorCode: e.payload!.errorCode,
      durationMs: e.durationMs,
      requestBody: e.payload!.requestBody,
      responseBody: e.payload!.responseBody,
      requestTruncated: e.payload!.requestTruncated,
      responseTruncated: e.payload!.responseTruncated,
      queryString: e.payload!.queryString,
      clientIp: e.payload!.clientIp,
      userAgent: e.payload!.userAgent,
      createdAt: e.at,
    })).filter((p) => p.id !== "");
```

and inside the transaction, after the `createMany` loop for raws:

```ts
      for (let i = 0; i < payloads.length; i += PAYLOAD_CHUNK) await tx.apiRequestPayload.createMany({ data: payloads.slice(i, i + PAYLOAD_CHUNK), skipDuplicates: true });
```

`fastify.d.ts`: add `apiResponseBody?: string;`.

`routes/public-api/index.ts`:
- Import `payloadLoggingEnabled`, `buildPayloadSnapshot` from `../../lib/public-api/payload-capture.js`.
- In `recordUsageOnResponse` build the event with:

```ts
    const enabled = payloadLoggingEnabled() && Boolean(who?.organizationId);
    recordApiRequest({
      /* existing fields unchanged */
      ...(request.apiId ? { logId: request.apiId } : {}),
      ...(enabled ? { payload: buildPayloadSnapshot({
        body: request.body, url: request.url, responseText: request.apiResponseBody,
        clientIp: clientIp(request.ip, request.headers["x-forwarded-for"], request.headers["x-real-ip"]),
        userAgent: request.headers["user-agent"],
      }) } : {}),
    });
```
(`clientIp` is already imported in this file.)
- In `publicApiRouter`, before the `onResponse` hook:

```ts
  // Capture the serialized response body for payload logging (string payloads only; off unless the flag is on).
  fastify.addHook("onSend", (req, _reply, payload, done) => {
    if (payloadLoggingEnabled() && typeof payload === "string") req.apiResponseBody = payload;
    done(null, payload);
  });
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && pnpm vitest run src/lib/public-api src/routes/public-api`
Expected: PASS (existing recorder tests unchanged because `payload`/`logId` are optional).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): capture request/response payloads in the usage recorder behind a flag"
```

---

### Task 4: Callback attempt logging

**Files:**
- Create: `apps/api/src/lib/public-api/callback-attempts.ts`, `callback-attempts.test.ts`
- Modify: `apps/api/src/workers/public-api-callbacks.worker.ts:17-59`, `public-api-callbacks.worker.test.ts`

**Interfaces:**
- Produces: `recordCallbackAttempt(prisma: PrismaClient, a: { organizationId: string; apiKeyId: string; url: string; method: string; fields: Record<string, string>; attempt: number; outcome: "delivered" | "http_error" | "network_error" | "dropped"; httpStatus?: number | null; reason?: string | null; durationMs: number }): Promise<void>` (no-op when the flag is off; swallows every error).

- [ ] **Step 1: Write the failing tests**

```ts
// callback-attempts.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { recordCallbackAttempt } from "./callback-attempts.js";

const attempt = { organizationId: "o", apiKeyId: "k", url: "https://c.example.com/cb", method: "POST", fields: { MessageUUID: "m1", Status: "sent" }, attempt: 1, outcome: "delivered" as const, httpStatus: 200, durationMs: 12 };
afterEach(() => { delete process.env["API_PAYLOAD_LOGGING_ENABLED"]; });

describe("recordCallbackAttempt", () => {
  it("does nothing when the flag is off", async () => {
    const create = vi.fn();
    await recordCallbackAttempt({ apiCallbackAttempt: { create } } as never, attempt);
    expect(create).not.toHaveBeenCalled();
  });
  it("writes one row with the message id taken from MessageUUID and the url without its query string", async () => {
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
    const create = vi.fn().mockResolvedValue({});
    await recordCallbackAttempt({ apiCallbackAttempt: { create } } as never, { ...attempt, url: "https://c.example.com/cb?secret=1" });
    expect(create.mock.calls[0]![0].data).toMatchObject({ organizationId: "o", apiKeyId: "k", messageId: "m1", url: "https://c.example.com/cb", outcome: "delivered", httpStatus: 200 });
  });
  it("never throws when the database fails", async () => {
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
    await expect(recordCallbackAttempt({ apiCallbackAttempt: { create: vi.fn().mockRejectedValue(new Error("db")) } } as never, attempt)).resolves.toBeUndefined();
  });
});
```

and in `public-api-callbacks.worker.test.ts` (reuse its existing mock setup): with the flag on, a 200 response records `delivered` with status 200; a 500 response records `http_error` with 500 and still throws; a rejected fetch records `network_error` and rethrows; an inactive org / unsafe URL records `dropped` with a reason and still throws `UnrecoverableError`.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/callback-attempts.test.ts src/workers/public-api-callbacks.worker.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `callback-attempts.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { payloadLoggingEnabled } from "./payload-capture.js";
import { safeErr } from "./safe-err.js";

export interface CallbackAttempt {
  organizationId: string; apiKeyId: string; url: string; method: string; fields: Record<string, string>;
  attempt: number; outcome: "delivered" | "http_error" | "network_error" | "dropped";
  httpStatus?: number | null; reason?: string | null; durationMs: number;
}

/** Best-effort audit row for one delivery attempt. Off unless payload logging is on; never throws. */
export async function recordCallbackAttempt(prisma: PrismaClient, a: CallbackAttempt): Promise<void> {
  if (!payloadLoggingEnabled()) return;
  try {
    await prisma.apiCallbackAttempt.create({
      data: {
        organizationId: a.organizationId, apiKeyId: a.apiKeyId, messageId: a.fields["MessageUUID"] ?? null,
        url: a.url.split("?")[0]!.slice(0, 2000), method: a.method, fields: a.fields, attempt: a.attempt,
        outcome: a.outcome, httpStatus: a.httpStatus ?? null, reason: a.reason ? a.reason.slice(0, 300) : null, durationMs: Math.max(0, Math.round(a.durationMs)),
      },
    });
  } catch (err) {
    console.warn("[public-api-callbacks] attempt log failed", safeErr(err));
  }
}
```

In `public-api-callbacks.worker.ts` change the signature to `deliverCallback(job: Pick<Job<CallbackJob>, "data"> & { attemptsMade?: number }, fetchImpl = fetch)`, compute `const attempt = (job.attemptsMade ?? 0) + 1; const started = Date.now();` at the top, define

```ts
  const log = (outcome: CallbackAttempt["outcome"], extra: { httpStatus?: number; reason?: string } = {}) =>
    recordCallbackAttempt(prisma, { organizationId, apiKeyId, url, method, fields, attempt, outcome, durationMs: Date.now() - started, ...extra });
```

and: before each `throw new UnrecoverableError(...)` call `await log("dropped", { reason: "<same text>" })`; wrap the `fetchImpl` call:

```ts
  let res: Response;
  try {
    res = await fetchImpl(/* unchanged arguments */);
  } catch (err) {
    await log("network_error", { reason: err instanceof Error ? err.name : "fetch failed" });
    throw err;
  }
  await res.body?.cancel().catch(() => {});
  if (!res.ok) { await log("http_error", { httpStatus: res.status }); throw new Error(`callback endpoint answered HTTP ${res.status}`); }
  await log("delivered", { httpStatus: res.status });
```

and pass the job through in the Worker processor: `(job) => deliverCallback(job)` already passes the whole job (it has `attemptsMade`).

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && pnpm vitest run src/lib/public-api src/workers/public-api-callbacks.worker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): log every callback delivery attempt"
```

---

### Task 5: Retention cleanup for payloads and callback attempts

**Files:**
- Create: `apps/api/src/lib/public-api/payload-cleanup.ts`, `payload-cleanup.test.ts`
- Modify: `apps/api/src/workers/message-cleanup.ts:17-21`

**Interfaces:**
- Produces: `payloadRetentionDays(): number`; `cleanupApiPayloads(prisma, now?, budgetMs?, clock?): Promise<number>` (rows deleted from both tables).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanupApiPayloads, payloadRetentionDays } from "./payload-cleanup.js";

afterEach(() => { delete process.env["API_PAYLOAD_RETENTION_DAYS"]; });

describe("payloadRetentionDays", () => {
  it.each([[undefined, 365], ["", 365], ["abc", 365], ["-5", 365], ["0", 365], ["30", 90], ["90", 90], ["730", 730]])("%j -> %i", (env, expected) => {
    if (env === undefined) delete process.env["API_PAYLOAD_RETENTION_DAYS"]; else process.env["API_PAYLOAD_RETENTION_DAYS"] = env;
    expect(payloadRetentionDays()).toBe(expected);
  });
});

describe("cleanupApiPayloads", () => {
  it("deletes in batches from both tables using a 365-day cutoff and stops on a short batch", async () => {
    const exec = vi.fn().mockResolvedValueOnce(5000).mockResolvedValueOnce(10).mockResolvedValueOnce(3);
    const now = new Date("2027-10-09T00:00:00Z");
    const n = await cleanupApiPayloads({ $executeRaw: exec } as never, now, 60_000, () => 0);
    expect(n).toBe(5013);
    expect(exec).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/payload-cleanup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { PrismaClient } from "@prisma/client";
import { CLEANUP_BUDGET_MS, DELETE_BATCH } from "./usage-cleanup.js";

const DEFAULT_DAYS = 365;
const MIN_DAYS = 90; // owner requirement: keep at least 3 months

export function payloadRetentionDays(): number {
  const n = Number.parseInt(process.env["API_PAYLOAD_RETENTION_DAYS"] ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAYS;
  return Math.max(MIN_DAYS, n);
}

/** Batched deletes of payload and callback-attempt rows past the retention. Returns rows deleted. */
export async function cleanupApiPayloads(
  prisma: PrismaClient,
  now: Date = new Date(),
  budgetMs: number = CLEANUP_BUDGET_MS,
  clock: () => number = Date.now
): Promise<number> {
  const cutoff = new Date(now.getTime() - payloadRetentionDays() * 86_400_000);
  const startedAt = clock();
  let total = 0;
  const step = async (table: "payloads" | "attempts"): Promise<number> => Number(table === "payloads"
    ? await prisma.$executeRaw`DELETE FROM api_request_payloads WHERE id IN (SELECT id FROM api_request_payloads WHERE created_at < ${cutoff} LIMIT ${DELETE_BATCH})`
    : await prisma.$executeRaw`DELETE FROM api_callback_attempts WHERE id IN (SELECT id FROM api_callback_attempts WHERE created_at < ${cutoff} LIMIT ${DELETE_BATCH})`);
  for (const table of ["payloads", "attempts"] as const) {
    do {
      const deleted = await step(table);
      total += deleted;
      if (deleted < DELETE_BATCH) break;
    } while (clock() - startedAt < budgetMs);
  }
  return total;
}
```

In `message-cleanup.ts` inside the `api-usage-cleanup` branch (after line 19) add:

```ts
        const deletedPayloads = await cleanupApiPayloads(prisma);
        if (deletedPayloads > 0) console.log(`[message-cleanup] deleted ${deletedPayloads} expired API payload rows`);
```
with `import { cleanupApiPayloads } from "../lib/public-api/payload-cleanup.js";`.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/payload-cleanup.test.ts src/workers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): 365-day retention cleanup for payloads and callback attempts"
```

---

### Task 6: Dashboard read endpoints (org-scoped)

**Files:**
- Modify: `apps/api/src/routes/api-usage.ts` (add after `/api-usage/requests`, before the closing `};` at line 162)
- Test: `apps/api/src/routes/api-usage.test.ts` (existing; follow its auth and prisma mock style)

**Interfaces:**
- Produces:
  - `GET /api-usage/payloads?limit&cursor&outcome&apiKeyId&endpoint` -> `{ enabled: boolean, data: Array<{ id, createdAt, method, endpoint, statusCode, outcome, errorClass, errorCode, durationMs, apiKeyId }>, nextCursor: string | null }`
  - `GET /api-usage/payloads/:id` -> full row or 404
  - `GET /api-usage/callbacks?messageId&limit&cursor` -> `{ data: Array<{ id, createdAt, messageId, url, method, attempt, outcome, httpStatus, reason, durationMs, fields }>, nextCursor }`

- [ ] **Step 1: Write the failing tests**

```ts
  it("payload detail: 404 for another org's id, 200 with bodies for the caller's own", async () => {
    mockPrisma.apiRequestPayload.findFirst.mockResolvedValue(null);
    expect((await get("/api-usage/payloads/abc")).statusCode).toBe(404);
    expect(mockPrisma.apiRequestPayload.findFirst.mock.calls[0]![0].where).toEqual({ id: "abc", organizationId: "org-1" });
    mockPrisma.apiRequestPayload.findFirst.mockResolvedValue({ id: "abc", organizationId: "org-1", requestBody: '{"a":1}', responseBody: "{}", createdAt: new Date("2026-10-09T00:00:00Z") });
    const ok = await get("/api-usage/payloads/abc");
    expect(ok.statusCode).toBe(200);
    expect(ok.json().requestBody).toBe('{"a":1}');
  });
  it("payload list is scoped to the org, newest first, with a cursor and the enabled flag", async () => {
    mockPrisma.apiRequestPayload.findMany.mockResolvedValue([]);
    const res = await get("/api-usage/payloads?limit=2");
    expect(res.json()).toMatchObject({ data: [], nextCursor: null, enabled: expect.any(Boolean) });
    const arg = mockPrisma.apiRequestPayload.findMany.mock.calls[0]![0];
    expect(arg.where.organizationId).toBe("org-1");
    expect(arg.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(arg.take).toBe(3);
  });
  it("callbacks list is org-scoped and filterable by messageId", async () => {
    mockPrisma.apiCallbackAttempt.findMany.mockResolvedValue([]);
    await get("/api-usage/callbacks?messageId=11111111-1111-4111-8111-111111111111");
    expect(mockPrisma.apiCallbackAttempt.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1", messageId: "11111111-1111-4111-8111-111111111111" });
  });
  it.each(["/api-usage/payloads?limit=0", "/api-usage/payloads?limit=101", "/api-usage/payloads?cursor=%%%", "/api-usage/callbacks?messageId=not-a-uuid", "/api-usage/payloads/not%20valid"])("400 for bad input %s", async (u) => {
    expect((await get(u)).statusCode).toBe(400);
  });
  it("403 without settings_api_key (same gate as the other usage routes)", async () => { /* reuse the file's existing permission-denied pattern against /api-usage/payloads */ });
```

(`get`, `mockPrisma` and the org id `org-1` are the helpers already used by this test file; add `apiRequestPayload` and `apiCallbackAttempt` mocks to its prisma mock object.)

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/routes/api-usage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** (inside `apiUsageRouter`, after the `/api-usage/requests` handler)

```ts
  const UUID = /^[0-9a-f-]{36}$/i;
  const encodeCursor = (d: Date, id: string) => Buffer.from(`${d.toISOString()}|${id}`).toString("base64url");
  const decodeCursor = (c: string): { at: Date; id: string } | null => {
    try {
      const [iso, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
      const at = new Date(iso ?? "");
      return id && /^[0-9a-f-]{36}$/i.test(id) && !Number.isNaN(at.getTime()) ? { at, id } : null;
    } catch { return null; }
  };
  const pageLimit = (q: Record<string, unknown>): number | null => {
    const raw = qp(q["limit"]);
    if (raw === undefined) return 50;
    if (!/^\d{1,3}$/.test(raw)) return null;
    const n = Number(raw);
    return n >= 1 && n <= 100 ? n : null;
  };
  const before = (c: { at: Date; id: string }) => ({ OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }] });

  fastify.get<{ Querystring: Record<string, unknown> }>("/api-usage/payloads", async (request, reply) => {
    const q = request.query ?? {};
    const limit = pageLimit(q);
    if (limit === null) return invalid(reply, "limit must be an integer between 1 and 100");
    const outcome = qp(q["outcome"]);
    if (outcome !== undefined && !OUTCOMES.has(outcome)) return invalid(reply, "outcome must be success, client_error, server_error or error");
    const endpoint = qp(q["endpoint"]);
    if (endpoint !== undefined && !ENDPOINTS.has(endpoint)) return invalid(reply, "endpoint is not a known endpoint");
    const apiKeyId = qp(q["apiKeyId"]);
    if (apiKeyId !== undefined && !ID_RE.test(apiKeyId)) return invalid(reply, "apiKeyId is invalid");
    const cursorRaw = qp(q["cursor"]);
    const cursor = cursorRaw === undefined ? null : decodeCursor(cursorRaw);
    if (cursorRaw !== undefined && !cursor) return invalid(reply, "cursor is invalid");

    const rows = await fastify.prisma.apiRequestPayload.findMany({
      where: {
        organizationId: request.auth.organizationId,
        ...(outcome ? { outcome: outcome === "error" ? { in: ["client_error", "server_error"] } : outcome } : {}),
        ...(endpoint ? { endpoint } : {}),
        ...(apiKeyId ? { apiKeyId } : {}),
        ...(cursor ? before(cursor) : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: { id: true, createdAt: true, method: true, endpoint: true, statusCode: true, outcome: true, errorClass: true, errorCode: true, durationMs: true, apiKeyId: true },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return reply.send({
      enabled: process.env["API_PAYLOAD_LOGGING_ENABLED"] === "true",
      data: page,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    });
  });

  fastify.get<{ Params: { id: string } }>("/api-usage/payloads/:id", async (request, reply) => {
    if (!UUID.test(request.params.id)) return invalid(reply, "id is invalid");
    const row = await fastify.prisma.apiRequestPayload.findFirst({ where: { id: request.params.id, organizationId: request.auth.organizationId } });
    if (!row) return notFound(reply);
    return reply.send(row);
  });

  fastify.get<{ Querystring: Record<string, unknown> }>("/api-usage/callbacks", async (request, reply) => {
    const q = request.query ?? {};
    const limit = pageLimit(q);
    if (limit === null) return invalid(reply, "limit must be an integer between 1 and 100");
    const messageId = qp(q["messageId"]);
    if (messageId !== undefined && !UUID.test(messageId)) return invalid(reply, "messageId is invalid");
    const cursorRaw = qp(q["cursor"]);
    const cursor = cursorRaw === undefined ? null : decodeCursor(cursorRaw);
    if (cursorRaw !== undefined && !cursor) return invalid(reply, "cursor is invalid");
    const rows = await fastify.prisma.apiCallbackAttempt.findMany({
      where: { organizationId: request.auth.organizationId, ...(messageId ? { messageId } : {}), ...(cursor ? before(cursor) : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return reply.send({ data: page, nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null });
  });
```

(`qp`, `invalid`, `notFound`, `OUTCOMES`, `ENDPOINTS`, `ID_RE` already exist in this file.)

- [ ] **Step 4: Run to verify pass.** Also run `cd apps/api && pnpm vitest run src/routes`.
Expected: PASS except the 2 known flaky segments/conversations tests.

- [ ] **Step 5: Security check and commit**

Confirm in the diff: all three `where` clauses contain `organizationId: request.auth.organizationId`; the detail route uses `findFirst({ id, organizationId })` (never `findUnique({ id })`); the existing `preHandler` gate covers the new routes.

```bash
git add apps/api/src/routes/api-usage.ts apps/api/src/routes/api-usage.test.ts
git commit -m "feat(api): org-scoped payload and callback history endpoints"
```

---

### Task 7: Web UI (Request history and Callback attempts)

**Files:**
- Modify: `apps/web/lib/api-usage.ts` (add types and fetchers after `fetchFailedRequests`, line 413)
- Create: `apps/web/components/settings/api-usage/RequestHistory.tsx`, `CallbackAttempts.tsx` and a test for each next to the existing component tests (follow the sibling `RecentFailedRequests` test)
- Modify: `apps/web/app/(dashboard)/settings/api-usage/page.tsx` (render both panels under `RecentFailedRequests`)

**Interfaces:**
- Consumes: the three endpoints from Task 6 via the existing `getBody(path)` helper (it already prefixes `/api/v1/api-usage`).
- Produces in `lib/api-usage.ts`: `type PayloadSummary`, `type PayloadDetail`, `fetchPayloads(opts)`, `fetchPayloadDetail(id)`, `fetchCallbackAttempts(opts)`.

- [ ] **Step 1: Write the failing tests** (Vitest + Testing Library, mocking `@/lib/api-usage` the same way the sibling test does)

```tsx
it("lists requests, and expanding a row loads and shows the request and response bodies", async () => {
  fetchPayloads.mockResolvedValue({ enabled: true, data: [{ id: "id1", createdAt: "2026-10-08T10:11:36Z", method: "POST", endpoint: "message.send", statusCode: 400, outcome: "client_error", errorClass: "validation", errorCode: "TEMPLATE_PARAMS_MISMATCH", durationMs: 66, apiKeyId: "k1" }], nextCursor: null });
  fetchPayloadDetail.mockResolvedValue({ id: "id1", requestBody: '{"dst":"1"}', responseBody: '{"error":"template parameters not matched"}', requestTruncated: false, responseTruncated: false });
  render(<RequestHistory apiKeyId={null} credentialNames={new Map()} />);
  await screen.findByText("400");
  await userEvent.click(screen.getByRole("button", { name: /view/i }));
  expect(await screen.findByText(/template parameters not matched/)).toBeInTheDocument();
  expect(screen.getByText(/"dst"/)).toBeInTheDocument();
});
it("shows a clear notice when payload logging is not enabled", async () => {
  fetchPayloads.mockResolvedValue({ enabled: false, data: [], nextCursor: null });
  render(<RequestHistory apiKeyId={null} credentialNames={new Map()} />);
  expect(await screen.findByText(/not enabled/i)).toBeInTheDocument();
});
it("shows a truncated warning when a body was cut", async () => { /* detail with requestTruncated: true -> text matches /truncated/i */ });
it("callback attempts: searching a message uuid lists outcomes and HTTP status", async () => {
  fetchCallbackAttempts.mockResolvedValue({ data: [{ id: "a1", createdAt: "2026-10-08T10:12:00Z", messageId: "m1", url: "https://c.example.com/cb", method: "POST", attempt: 1, outcome: "http_error", httpStatus: 500, reason: null, durationMs: 80, fields: { Status: "sent" } }], nextCursor: null });
  render(<CallbackAttempts />);
  await userEvent.type(screen.getByLabelText(/message uuid/i), "11111111-1111-4111-8111-111111111111");
  await userEvent.click(screen.getByRole("button", { name: /search/i }));
  expect(await screen.findByText("500")).toBeInTheDocument();
  expect(screen.getByText(/http_error|HTTP error/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run components/settings/api-usage`
Expected: FAIL.

- [ ] **Step 3: Implement**
  - `lib/api-usage.ts`: `fetchPayloads` builds `URLSearchParams` (limit, cursor, apiKeyId) and calls `getBody("/payloads?...")`; `fetchPayloadDetail(id)` calls `getBody(\`/payloads/${encodeURIComponent(id)}\`)`; `fetchCallbackAttempts({ messageId, cursor })` calls `getBody("/callbacks?...")`. Normalizers validate the shape like `normalizeRequestsPage` does and throw `ApiUsageError` on malformed bodies.
  - `RequestHistory.tsx`: copy the structure of `RecentFailedRequests.tsx` (same `Panel`, `useInfiniteQuery`, load-more, error/empty states), with columns Time, Endpoint, Status, Error code, Credential, Duration and a "View" button per row that toggles an inline detail row. Detail uses `useQuery(["api-usage","payload",id], () => fetchPayloadDetail(id))` and renders two `<pre>` blocks (Request, Response) with JSON pretty-printed when parseable (`JSON.stringify(JSON.parse(s), null, 2)` inside try/catch, raw text otherwise), a "Copy" button using `navigator.clipboard.writeText`, and a "Body was truncated at 16 KB" note when the flag is set. When `enabled === false` show "Request logging is not enabled for this platform yet." instead of the table. Title: "Request history (kept 365 days)".
  - `CallbackAttempts.tsx`: a labelled input "Message UUID" + "Search" button; on submit run `fetchCallbackAttempts({ messageId })` and render a table (Time, Attempt, Result, HTTP status, Reason, Duration). Reject non-UUID input client-side with the message "Enter the message_uuid returned by the API."
  - `page.tsx`: render `<RequestHistory .../>` and `<CallbackAttempts />` below `RecentFailedRequests`, passing the same `apiKeyId` and `credentialNames` props.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && pnpm vitest run components/settings/api-usage && pnpm tsc --noEmit && pnpm lint`
Expected: PASS, no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): request history and callback attempts in API Usage"
```

---

### Task 8: Staff lookup script with audit row

**Files:**
- Create: `apps/api/scripts/lookup-api-request.ts`
- Create: `apps/api/scripts/lookup-api-request.args.ts` (pure arg parsing) and `apps/api/scripts/lookup-api-request.args.test.ts`

**Interfaces:**
- Produces: `parseArgs(argv: string[]): { org: string; reason: string; apiId?: string; sinceHours: number; actor: string }`, throws `Error` with a usage message when `--org` or `--reason` is missing/blank.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseArgs } from "./lookup-api-request.args.js";

describe("parseArgs", () => {
  it("requires --org and a non-trivial --reason", () => {
    expect(() => parseArgs([])).toThrow(/--org/);
    expect(() => parseArgs(["--org", "org_1"])).toThrow(/--reason/);
    expect(() => parseArgs(["--org", "org_1", "--reason", "x"])).toThrow(/--reason/);
  });
  it("parses api-id, since and actor with defaults", () => {
    const a = parseArgs(["--org", "org_1", "--reason", "client ticket 123", "--api-id", "11111111-1111-4111-8111-111111111111"]);
    expect(a).toMatchObject({ org: "org_1", reason: "client ticket 123", apiId: "11111111-1111-4111-8111-111111111111", sinceHours: 24 });
    expect(a.actor.length).toBeGreaterThan(0);
    expect(parseArgs(["--org", "o", "--reason", "client ticket 9", "--since-hours", "72"]).sinceHours).toBe(72);
  });
  it("rejects a malformed api-id and an out-of-range window", () => {
    expect(() => parseArgs(["--org", "o", "--reason", "client ticket 9", "--api-id", "nope"])).toThrow(/api-id/);
    expect(() => parseArgs(["--org", "o", "--reason", "client ticket 9", "--since-hours", "0"])).toThrow(/since-hours/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run scripts/lookup-api-request.args.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lookup-api-request.args.ts`:

```ts
import { userInfo } from "node:os";

const flag = (argv: string[], name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

export function parseArgs(argv: string[]) {
  const org = flag(argv, "--org")?.trim();
  if (!org) throw new Error("--org <organizationId> is required");
  const reason = flag(argv, "--reason")?.trim();
  if (!reason || reason.length < 8) throw new Error("--reason \"<ticket or why>\" is required (at least 8 characters)");
  const apiId = flag(argv, "--api-id")?.trim();
  if (apiId !== undefined && !/^[0-9a-f-]{36}$/i.test(apiId)) throw new Error("--api-id must be a UUID (the api_id from the response)");
  const sinceRaw = flag(argv, "--since-hours");
  const sinceHours = sinceRaw === undefined ? 24 : Number(sinceRaw);
  if (!Number.isInteger(sinceHours) || sinceHours < 1 || sinceHours > 24 * 365) throw new Error("--since-hours must be an integer between 1 and 8760");
  return { org, reason, ...(apiId ? { apiId } : {}), sinceHours, actor: process.env["USERNAME"] ?? process.env["USER"] ?? userInfo().username };
}
```

`lookup-api-request.ts`:

```ts
// Read-only staff lookup of stored public API payloads. Writes ONE audit row per run. Usage:
//   railway run --service Postgres pnpm tsx scripts/lookup-api-request.ts --org <orgId> --reason "<ticket>" [--api-id <uuid>] [--since-hours 24]
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseArgs } from "./lookup-api-request.args.js";

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const url = process.env["DATABASE_PUBLIC_URL"] ?? process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_PUBLIC_URL or DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const since = new Date(Date.now() - a.sinceHours * 3_600_000);
    const rows = await prisma.apiRequestPayload.findMany({
      where: { organizationId: a.org, ...(a.apiId ? { id: a.apiId } : { createdAt: { gte: since } }) },
      orderBy: { createdAt: "desc" }, take: 50,
    });
    await prisma.apiPayloadAccessAudit.create({
      data: { actor: a.actor, organizationId: a.org, reason: a.reason, query: JSON.stringify({ apiId: a.apiId ?? null, sinceHours: a.sinceHours }), rowsReturned: rows.length },
    });
    for (const r of rows) {
      console.log(`--- ${r.createdAt.toISOString()} ${r.method} ${r.endpoint} -> ${r.statusCode} ${r.errorCode ?? ""} (api_id ${r.id}, ${r.durationMs} ms)`);
      console.log("REQUEST :", r.requestBody ?? "(none)");
      console.log("RESPONSE:", r.responseBody ?? "(none)");
    }
    console.log(`\n${rows.length} row(s). Access recorded in api_payload_access_audit.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : "failed"); process.exit(1); });
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && pnpm vitest run scripts/lookup-api-request.args.test.ts && pnpm tsc --noEmit`
Expected: PASS. (The script itself is exercised manually in Task 9, against the throwaway Postgres from Task 1.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/scripts
git commit -m "feat(api): audited read-only staff lookup of stored API payloads"
```

---

### Task 9: End-to-end check, env docs and release checklist

**Files:**
- Modify: `.env.example`, `docs/prd-public-api-request-payload-logging.md`
- Create: `docs/api/payload-logging-runbook.md`

- [ ] **Step 1: Real-Postgres smoke.** Extend `apps/api/scripts/smoke-usage-tracking.ts` (or add `smoke-payload-logging.ts` next to it, same docker `postgres:16` port 55432 `smoke*` database pattern, refusing non-local DBs) to: apply the Task 1 migration; with `API_PAYLOAD_LOGGING_ENABLED=true` send one 202, one 400 and one 401-with-credential request through the real app; flush; assert one `api_request_payloads` row per request whose `id` equals the response `api_id`, no row contains the Basic-auth header or the token string, a 17 KB body is truncated, cross-org `findFirst` returns null; run the Task 8 script and assert one audit row.

Run: `cd apps/api && pnpm tsx scripts/smoke-payload-logging.ts`
Expected: all checks print OK.

- [ ] **Step 2: Env docs.** Add to `.env.example`:

```
# Public API payload logging (off by default). Stores redacted request/response bodies and callback attempts.
API_PAYLOAD_LOGGING_ENABLED=false
# Days to keep stored payloads and callback attempts (default 365, minimum 90).
API_PAYLOAD_RETENTION_DAYS=365
```

- [ ] **Step 3: Runbook** `docs/api/payload-logging-runbook.md`: how to look up a request (client's own: API Usage > Request history; staff: the script with `--org` and `--reason`), what is redacted, retention, the erasure procedure (delete rows by `organization_id` and, for one customer, by searching the stored text for the phone number, run as an audited manual statement; owner decision pending on building a tool), and the release checklist: (1) deploy with the flag off (migration `20261009000000_api_payload_logging` runs via `start.sh`; if applied out-of-band run `prisma migrate resolve --applied 20261009000000_api_payload_logging`); (2) privacy policy and terms line published; (3) owner sets `API_PAYLOAD_LOGGING_ENABLED=true` on Railway production/api; (4) verify with one test send and the API Usage screen.

- [ ] **Step 4: Update the PRD** section 4 to say `api_request_payloads` is self-contained (own summary columns, id equals the `api_id`, no link to `api_request_logs`).

- [ ] **Step 5: Final verification and commit**

Run: `cd apps/api && pnpm vitest run` and `cd apps/web && pnpm vitest run`, then `/check`.
Expected: all green except the 2 known flaky API tests (segments/conversations) and the known Redis-rejection noise. Report any other failure as real.

```bash
git add .env.example docs apps/api/scripts
git commit -m "docs: payload logging runbook, env knobs and smoke test"
```

---

## Self-Review

- Spec coverage: tables (T1); redaction, caps, flag (T2); capture, org-less skip, sampling/401 cap, buffer budget, api_id as key (T3); callbacks (T4); 365-day retention (T5); org-scoped reads and 404 on cross-org (T6); client-facing UI (T7); staff audited script (T8); env, runbook, release checklist, smoke (T9). Privacy-policy line and erasure tool are called out as owner actions in T9.
- Types: `PayloadSnapshot`, `buildPayloadSnapshot`, `payloadSize`, `payloadLoggingEnabled` (T2) are used with identical signatures in T3 and T4; `recordCallbackAttempt` (T4) is referenced only in the worker; endpoint response shapes in T6 match the web types in T7.
- Placeholders: none left unresolved. Two test steps (T3 "401 over the cap", T6 "403 without permission") reuse existing fixtures of the named test files; the implementer must read those files first (stated in the task).
- Dependency: needs `request.apiId` from the clear-errors plan Task 1; if that plan is not merged first, T3's `logId` is simply absent and rows get no payload (the `id` filter in T3 drops them), so ship in the stated order.
