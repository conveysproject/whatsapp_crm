# Public API Clear Error Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every failure of the public API (sync 4xx/5xx and async Meta rejections) tells the client in plain words what went wrong and what to do, with a stable machine code, and the `api_id` in the response is traceable to our logs.

**Architecture:** One error catalog (`lib/public-api/error-catalog.ts`) is the only place error codes, sentences and hints live. `plivoError`, the plugin error handler, the throttle builder and the auth hook all build bodies from it. A per-request `request.apiId` is generated in an `onRequest` hook and used for the response body and (in the logging plan) as the request-log row id. Async failures get an `ErrorMessage` derived from the same catalog.

**Tech Stack:** TypeScript, Fastify, `@fastify/rate-limit`, Vitest.

**Spec:** `docs/prd-public-api-request-payload-logging.md` (extended by this plan; owner decisions 2026-10-09 recorded below).

## Global Constraints

- Owner decisions: response body stays `{ api_id, error }` and gains `error_code` and `hint` (additive; `error` stays a plain sentence); callbacks and message GET gain `ErrorMessage` / `error_message` next to the existing `ErrorCode` / `error_code`; one `api_id` for the response and the log row; all failure classes are in scope: validation 400, auth 401/403/404, 429/500, template create/update/delete.
- Do not leak existence: wrong auth_id and wrong token return the same message; a credential that exists in another org is never confirmed.
- Never include request values, tokens, phone numbers (except a masked last-4 of the caller's own connected number) or internal error text in a message.
- No word "Plivo" in any customer-facing text.
- HTTP status codes do not change, except none: this plan changes bodies and headers only.
- Meta error texts must be checked against Meta's current error-code reference (https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes) before commit (Task 5, Step 1).
- Run tests with `cd apps/api && pnpm vitest run <path>`.
- Ordering: Plan 1 (`2026-10-09-public-api-send-validation.md`) first, this plan second, the payload-logging plan last.

## Review Focus

- Malformed JSON, empty body and wrong Content-Type each get their own clear sentence, not "Invalid request".
- 401 variants (no header, malformed Basic, URL auth_id differs from username, wrong credentials) are distinguishable without revealing whether the credential exists.
- 429 includes how long to wait (and a `Retry-After` header); 500 tells the client to retry and quote the `api_id`.
- A thrown non-Error value inside a handler still yields a well-formed body with an `api_id`.
- The `api_id` in an error body equals the `api_id` of the matching request-log row (set up here, persisted in the logging plan).
- A failed callback and the message GET for the same message show the same `ErrorMessage`; an unknown Meta code still gets a readable generic sentence with the code.

---

## File Structure

- Create `apps/api/src/lib/public-api/error-catalog.ts`: codes, sentences, hints, `ERROR_CATALOG`, `errorMessageForCode`.
- Modify `apps/api/src/lib/public-api/responses.ts`: `plivoErrorBody`, `plivoError`, new `apiError`.
- Modify `apps/api/src/types/fastify.d.ts`: `apiId?: string`.
- Modify `apps/api/src/routes/public-api/index.ts`: `onRequest` apiId hook, error handler, throttle builder.
- Modify `apps/api/src/routes/public-api/auth.ts`, `messages.ts`, `templates.ts`.
- Modify `apps/api/src/lib/public-api/send-mapping.ts` (`SendValidationError` code), `template-validation.ts`, `templates-mapping.ts` (api_id), `callbacks.ts`, `meta-errors.ts`.
- Tests next to each file; docs in `docs/api/`.

---

### Task 1: Error catalog, response helpers, per-request api_id

**Files:**
- Create: `apps/api/src/lib/public-api/error-catalog.ts`, `apps/api/src/lib/public-api/error-catalog.test.ts`
- Modify: `apps/api/src/lib/public-api/responses.ts`, `apps/api/src/types/fastify.d.ts`, `apps/api/src/routes/public-api/index.ts`

**Interfaces:**
- Produces:
  - `type ApiErrorCode = keyof typeof ERROR_CATALOG`
  - `ERROR_CATALOG: Record<string, { message: string; hint?: string }>`
  - `apiErrorBody(code: ApiErrorCode, opts?: { message?: string; hint?: string; apiId?: string }): { api_id: string; error: string; error_code: string; hint?: string }`
  - `apiError(reply: FastifyReply, status: number, code: ApiErrorCode, opts?: { message?: string; hint?: string })` (uses `reply.request.apiId`)
  - `plivoError(reply, status, message)` stays (default code `REQUEST_FAILED`) so untouched callers keep working until Task 4.
  - `request.apiId: string`

- [ ] **Step 1: Write the failing tests** (`error-catalog.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { ERROR_CATALOG, apiErrorBody } from "./error-catalog.js";

describe("error catalog", () => {
  it("every entry has a sentence and none mentions the old provider name", () => {
    for (const [code, e] of Object.entries(ERROR_CATALOG)) {
      expect(e.message.length, code).toBeGreaterThan(10);
      expect(JSON.stringify(e).toLowerCase(), code).not.toContain("plivo");
    }
  });
  it("builds {api_id, error, error_code, hint} and honours overrides and a fixed api_id", () => {
    const b = apiErrorBody("RATE_LIMITED", { hint: "Wait 30 seconds.", apiId: "abc" });
    expect(b).toEqual({ api_id: "abc", error: ERROR_CATALOG.RATE_LIMITED!.message, error_code: "RATE_LIMITED", hint: "Wait 30 seconds." });
    expect(apiErrorBody("VALIDATION_FAILED", { message: "dst is required" }).error).toBe("dst is required");
  });
  it("generates an api_id when none is given", () => {
    expect(apiErrorBody("INTERNAL_ERROR").api_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/error-catalog.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`error-catalog.ts`:

```ts
import { randomUUID } from "node:crypto";

/** The ONLY place public-API error codes, sentences and hints are defined. */
export const ERROR_CATALOG = {
  REQUEST_FAILED: { message: "The request could not be completed." },
  INVALID_JSON: { message: "The request body is not valid JSON.", hint: "Send a JSON object with Content-Type: application/json." },
  EMPTY_BODY: { message: "The request body is empty.", hint: "Send a JSON object with Content-Type: application/json." },
  UNSUPPORTED_CONTENT_TYPE: { message: "Content-Type must be application/json.", hint: "Add the header Content-Type: application/json." },
  BODY_TOO_LARGE: { message: "The request body is too large.", hint: "Reduce the size of the request." },
  VALIDATION_FAILED: { message: "The request is invalid.", hint: "Fix the field named in the message and send again." },
  TEMPLATE_PARAMS_MISMATCH: { message: "The template parameters do not match the template.", hint: "Send one parameter for every variable in the template body and header, using the same names (or numbers) as the template." },
  TEMPLATE_NOT_FOUND: { message: "Template not found.", hint: "Check the template name and language in your WBMSG account." },
  TEMPLATE_NOT_APPROVED: { message: "The template is not approved.", hint: "Only approved templates can be sent. Check its status in your WBMSG account." },
  AUTH_MISSING: { message: "The Authorization header is missing.", hint: "Use HTTP Basic auth: auth_id as the username and the auth token as the password." },
  AUTH_MALFORMED: { message: "The Authorization header is not valid Basic auth.", hint: "Use HTTP Basic auth: base64(auth_id:auth_token)." },
  AUTH_ID_MISMATCH: { message: "The auth_id in the URL does not match the username in the Authorization header.", hint: "Use the same auth_id in /v1/Account/{auth_id}/ and as the Basic-auth username." },
  AUTH_INVALID: { message: "The auth_id or auth token is invalid, or the credential was revoked.", hint: "Check both values, or create a new credential in WBMSG under Settings > API." },
  ACCOUNT_INACTIVE: { message: "This account is not active.", hint: "Contact WBMSG support." },
  API_NOT_AVAILABLE: { message: "API access is not available for this account.", hint: "Contact WBMSG support to enable it." },
  NOT_FOUND: { message: "The requested resource was not found.", hint: "Check the id in the URL." },
  MESSAGE_NOT_FOUND: { message: "Message not found.", hint: "Check the message_uuid; it must belong to this account." },
  WHATSAPP_NOT_CONNECTED: { message: "No WhatsApp number is connected to this account.", hint: "Connect a WhatsApp Business number in WBMSG first." },
  SRC_MISMATCH: { message: "src is not the WhatsApp Business number connected to this account.", hint: "Set src to the connected number." },
  CALLBACK_URL_INVALID: { message: "The callback url is not allowed.", hint: "Use a public https URL." },
  QUEUE_FAILED: { message: "We could not queue your message.", hint: "Retry in a few seconds. If it keeps failing, contact support and quote the api_id." },
  RATE_LIMITED: { message: "Too many requests.", hint: "Wait a few seconds and retry; see the Retry-After header." },
  INTERNAL_ERROR: { message: "Something went wrong on our side. Your request was not processed.", hint: "Retry in a few seconds. If it keeps failing, contact support and quote the api_id." },
  META_UNAVAILABLE: { message: "WhatsApp (Meta) did not accept the request right now.", hint: "Retry later. If it keeps failing, contact support and quote the api_id." },
} as const satisfies Record<string, { message: string; hint?: string }>;

export type ApiErrorCode = keyof typeof ERROR_CATALOG;

export interface ApiErrorBody { api_id: string; error: string; error_code: string; hint?: string }

export function apiErrorBody(code: ApiErrorCode, opts: { message?: string; hint?: string; apiId?: string } = {}): ApiErrorBody {
  const base = ERROR_CATALOG[code] as { message: string; hint?: string };
  const hint = opts.hint ?? base.hint;
  return { api_id: opts.apiId ?? randomUUID(), error: opts.message ?? base.message, error_code: code, ...(hint ? { hint } : {}) };
}
```

`responses.ts`: replace the body of `plivoErrorBody` and `plivoError`, and add `apiError`:

```ts
import { apiErrorBody, type ApiErrorCode } from "./error-catalog.js";

export function plivoErrorBody(message: string, apiId?: string) {
  return apiErrorBody("REQUEST_FAILED", { message, ...(apiId ? { apiId } : {}) });
}

export function plivoError(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).send(plivoErrorBody(message, reply.request?.apiId));
}

export function apiError(reply: FastifyReply, status: number, code: ApiErrorCode, opts: { message?: string; hint?: string } = {}) {
  return reply.status(status).send(apiErrorBody(code, { ...opts, ...(reply.request?.apiId ? { apiId: reply.request.apiId } : {}) }));
}
```

`types/fastify.d.ts`: add `apiId?: string;` next to `publicApiAttempt` (line 18).

`routes/public-api/index.ts`, inside `publicApiRouter` before the first hook:

```ts
  // One id per request: used in every response body and (logging plan) as the request-log row id.
  fastify.addHook("onRequest", (req, _reply, done) => { req.apiId = randomUUID(); done(); });
```
(import `randomUUID` from `node:crypto`.) Replace the four `newApiId()` uses in `messages.ts` / `templates.ts` / `templates-mapping.ts` response bodies with `request.apiId ?? newApiId()`; for `templates-mapping.ts` (lines 122, 145) add an `apiId` parameter defaulting to `newApiId()` and pass `request.apiId` from the route.

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && pnpm vitest run src/lib/public-api src/routes/public-api`
Expected: PASS. Existing assertions `toEqual({ api_id: expect.any(String), error: "Internal server error" })` in `index.test.ts:177` will be updated in Task 2.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/public-api apps/api/src/types/fastify.d.ts apps/api/src/routes/public-api
git commit -m "feat(api): error catalog and per-request api_id for the public API"
```

---

### Task 2: Error handler, throttle and 5xx responses

**Files:**
- Modify: `apps/api/src/routes/public-api/index.ts:22-33,52`
- Test: `apps/api/src/routes/public-api/index.test.ts`

**Interfaces:**
- Consumes: `apiErrorBody`, `request.apiId` (Task 1).

- [ ] **Step 1: Write the failing tests** (add to `index.test.ts`, using the file's existing helpers for building the app; follow the surrounding tests for `app`, auth headers and injection)

```ts
  it("malformed JSON gets a clear INVALID_JSON message", async () => {
    const res = await app.inject({ method: "POST", url: `/v1/Account/${AUTH_ID}/Message/`, headers: { ...authHeaders, "content-type": "application/json" }, payload: "{not json" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error_code: "INVALID_JSON", error: expect.stringContaining("not valid JSON"), hint: expect.any(String), api_id: expect.any(String) });
  });
  it("wrong Content-Type gets UNSUPPORTED_CONTENT_TYPE (415)", async () => {
    const res = await app.inject({ method: "POST", url: `/v1/Account/${AUTH_ID}/Message/`, headers: { ...authHeaders, "content-type": "text/plain" }, payload: "x" });
    expect(res.statusCode).toBe(415);
    expect(res.json().error_code).toBe("UNSUPPORTED_CONTENT_TYPE");
  });
  it("an unexpected error returns INTERNAL_ERROR with a retry hint and the same api_id as the request", async () => {
    // reuse the existing test that forces a thrown error (index.test.ts near line 177)
    const body = res.json();
    expect(body).toMatchObject({ error_code: "INTERNAL_ERROR", hint: expect.stringContaining("api_id") });
  });
  it("429 carries Retry-After and a wait hint", async () => {
    // reuse the existing throttling test setup in this file
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toMatch(/^\d+$/);
    expect(res.json()).toMatchObject({ error_code: "RATE_LIMITED", hint: expect.stringMatching(/\d+ second/) });
  });
```

(`AUTH_ID`, `authHeaders`, `app` and the forced-error / throttle setups are the ones already used by neighbouring tests in this file; read the file first and reuse them rather than redefining.)

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/routes/public-api/index.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Replace `publicApiErrorHandler` (lines 22-33) with:

```ts
export function publicApiErrorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const apiId = request.apiId;
  const status = (error as { statusCode?: number } | null | undefined)?.statusCode;
  const code = (error as { code?: string } | null | undefined)?.code ?? "";
  const send = (s: number, c: Parameters<typeof apiErrorBody>[0], hint?: string) =>
    reply.status(s).send(apiErrorBody(c, { ...(hint ? { hint } : {}), ...(apiId ? { apiId } : {}) }));

  if (status === 429) return send(429, "RATE_LIMITED");
  if (status === 413) return send(413, "BODY_TOO_LARGE");
  if (status === 415) return send(415, "UNSUPPORTED_CONTENT_TYPE");
  if (status === 400 && /EMPTY_JSON_BODY/.test(code)) return send(400, "EMPTY_BODY");
  if (status === 400) return send(400, "INVALID_JSON");
  if (typeof status === "number" && status >= 400 && status < 500) return send(status, "VALIDATION_FAILED");
  // Name/code and request id only: error messages (e.g. Prisma validation errors) can echo phone numbers and text.
  request.log.error({ error: safeErr(error), reqId: request.id, apiId }, "public API unhandled error");
  return send(500, "INTERNAL_ERROR");
}
```

Replace the throttle builder (line 52) with:

```ts
const throttled = (_req: unknown, context: { ttl?: number }) => {
  const seconds = Math.max(1, Math.ceil((context?.ttl ?? 60_000) / 1000));
  return { statusCode: 429, headers: { "retry-after": String(seconds) }, ...apiErrorBody("RATE_LIMITED", { hint: `Wait ${seconds} second(s) and retry.` }) };
};
```

and, in the same file, add `Retry-After` to the handler's 429 branch: `reply.header("retry-after", "60")` before `send(429, ...)`. Import `apiErrorBody` from `../../lib/public-api/error-catalog.js`.

- [ ] **Step 4: Run to verify pass.** Update the old assertion at `index.test.ts:177` to `toMatchObject({ api_id: expect.any(String), error_code: "INTERNAL_ERROR" })`.

Run: `cd apps/api && pnpm vitest run src/routes/public-api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/public-api/index.ts apps/api/src/routes/public-api/index.test.ts
git commit -m "feat(api): clear messages for malformed body, content type, throttling and server errors"
```

---

### Task 3: Authentication and not-found messages

**Files:**
- Modify: `apps/api/src/routes/public-api/auth.ts:14-37`, `messages.ts:240`, `templates.ts:36,161,175,205`
- Test: `apps/api/src/routes/public-api/auth.test.ts`

- [ ] **Step 1: Write the failing tests** (add to `auth.test.ts`, reusing its existing app/mocks setup)

```ts
  it.each([
    ["no Authorization header", {}, "AUTH_MISSING"],
    ["not Basic", { authorization: "Bearer abc" }, "AUTH_MALFORMED"],
    ["Basic without a colon", { authorization: "Basic " + Buffer.from("nocolon").toString("base64") }, "AUTH_MALFORMED"],
    ["URL auth_id differs from the username", { authorization: "Basic " + Buffer.from("OTHERID:tok").toString("base64") }, "AUTH_ID_MISMATCH"],
  ])("401 %s -> %s", async (_n, headers, code) => {
    const res = await app.inject({ method: "GET", url: `/v1/Account/${AUTH_ID}/Message/`, headers });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error_code: code, hint: expect.any(String) });
  });
  it("wrong token, unknown id and revoked credential are indistinguishable (AUTH_INVALID)", async () => {
    // arrange three cases with the file's existing prisma.apiKey mock: unknown, revoked, wrong token
    for (const res of results) expect(res.json()).toMatchObject({ error_code: "AUTH_INVALID" });
    expect(new Set(results.map((r) => r.json().error)).size).toBe(1);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/routes/public-api/auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `auth.ts` replace the top of `publicApiAuth` (lines 14-27) with:

```ts
  const header = request.headers.authorization;
  if (!header) return apiError(reply, 401, "AUTH_MISSING");
  const m = /^Basic\s+(\S+)$/i.exec(header);
  const decoded = m ? Buffer.from(m[1]!, "base64").toString("utf8") : "";
  const sep = decoded.indexOf(":");
  if (!m || sep === -1) return apiError(reply, 401, "AUTH_MALFORMED");
  const authId = decoded.slice(0, sep);
  const token = decoded.slice(sep + 1);
  // Both values are the caller's own input, so naming this mismatch reveals nothing about stored credentials.
  if (authId !== request.params.authId) return apiError(reply, 401, "AUTH_ID_MISMATCH");

  // The credential is only ever looked up by the id the caller proved knowledge of AND that matches the URL.
  const row = authId ? await request.server.prisma.apiKey.findUnique({ where: { id: authId } }) : null;
  // Usage attribution only (no effect on the response): a wrong token against a real credential counts as that credential's failure.
  if (row) request.publicApiAttempt = { apiKeyId: row.id, organizationId: row.organizationId };
  const hashOk = tokenMatchesHash(token, row?.keyHash ?? DUMMY_HASH);
  if (!row || !hashOk || row.revokedAt) return apiError(reply, 401, "AUTH_INVALID");
```

Replace the 403s: `apiError(reply, 403, "ACCOUNT_INACTIVE")` and `apiError(reply, 403, "API_NOT_AVAILABLE")`. Remove the now-unused `BAD_CREDENTIALS` constant and `plivoError` import. In `messages.ts:240` use `apiError(reply, 404, "MESSAGE_NOT_FOUND")`; in `templates.ts` replace `NOT_FOUND` uses (lines 36, 161, 175, 205) with `apiError(reply, 404, "TEMPLATE_NOT_FOUND")`.

Note: the constant-time compare property is kept for the unknown-id case: the unknown-id and wrong-token paths still both reach `tokenMatchesHash` before responding.

- [ ] **Step 4: Run to verify pass.** Fix any older test that asserted the old sentence ("Authentication credentials were not provided or are invalid").

Run: `cd apps/api && pnpm vitest run src/routes/public-api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/public-api
git commit -m "feat(api): distinguishable, non-leaking authentication and not-found messages"
```

---

### Task 4: Validation, send and template error messages with codes

**Files:**
- Modify: `apps/api/src/lib/public-api/send-mapping.ts:7` (`SendValidationError`), `template-validation.ts`, `routes/public-api/messages.ts:76,84,86,91,171`, `routes/public-api/templates.ts:50,56-58,64,94,176,178,208`
- Test: `messages.test.ts`, `templates.test.ts`, `template-validation.test.ts`

**Interfaces:**
- Produces: `class SendValidationError extends Error { constructor(message: string, readonly code: ApiErrorCode = "VALIDATION_FAILED") }`.

- [ ] **Step 1: Write the failing tests**

```ts
// messages.test.ts
  it("send errors carry error_code and a hint", async () => {
    const r1 = await post(app, { ...body, dst: "+14155552672<abc" });
    expect(r1.json()).toMatchObject({ error_code: "VALIDATION_FAILED", hint: expect.any(String) });
    mockPrisma.organization.findUnique.mockResolvedValue({ phoneNumberId: null, wabaAccessToken: null });
    expect((await post(app, body)).json().error_code).toBe("WHATSAPP_NOT_CONNECTED");
  });
  it("src mismatch tells the client which number is connected (masked)", async () => {
    const r = await post(app, { ...body, src: "+14155551234" });
    expect(r.json()).toMatchObject({ error_code: "SRC_MISMATCH", hint: expect.stringMatching(/ends in \d{4}/) });
  });
  it("template errors use TEMPLATE_* codes", async () => {
    mockPrisma.template.findMany.mockResolvedValue([]);
    const r = await post(app, { ...body, text: undefined, template: { name: "nope", language: "en" } });
    expect(r.json()).toMatchObject({ error_code: "TEMPLATE_NOT_FOUND", error: 'Template "nope" not found' });
  });
```

and in `template-validation.test.ts` add: `expect(() => validateAgainstTemplate(...)).toThrow(expect.objectContaining({ code: "TEMPLATE_PARAMS_MISMATCH" }))` for one mismatch case, `TEMPLATE_NOT_APPROVED` for the not-approved case, `TEMPLATE_NOT_FOUND` for not found.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/routes/public-api/messages.test.ts src/lib/public-api/template-validation.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`send-mapping.ts` line 7:

```ts
import type { ApiErrorCode } from "./error-catalog.js";
export class SendValidationError extends Error {
  constructor(message: string, readonly code: ApiErrorCode = "VALIDATION_FAILED") { super(message); }
}
```

`template-validation.ts`: pass the code as the second argument: not found -> `"TEMPLATE_NOT_FOUND"`, no language -> `"TEMPLATE_NOT_FOUND"`, not approved -> `"TEMPLATE_NOT_APPROVED"`, the `notMatched` helper and the duplicate-match message -> `"TEMPLATE_PARAMS_MISMATCH"` / `"VALIDATION_FAILED"`.

`messages.ts`:
- line 76 and 119: `if (err instanceof SendValidationError) return apiError(reply, 400, err.code, { message: err.message });`
- line 84: `return apiError(reply, 400, "WHATSAPP_NOT_CONNECTED");`
- line 86: build the hint from the org's own connected number: `return apiError(reply, 400, "SRC_MISMATCH", { hint: \`Set src to the connected number (ends in ${connected.slice(-4)}).\` });` (`connected` is already computed on line 85; if empty use the `WHATSAPP_NOT_CONNECTED` error instead).
- line 91: `return apiError(reply, 400, "CALLBACK_URL_INVALID", { message: \`url: ${err.message}\` });`
- line 171: `return apiError(reply, 500, "QUEUE_FAILED");`

`templates.ts`: `notConnected` -> `apiError(reply, 400, "WHATSAPP_NOT_CONNECTED")`; `TemplateValidationError` -> `apiError(reply, 400, "VALIDATION_FAILED", { message: err.message })`; duplicate (line 94) -> `apiError(reply, 400, "VALIDATION_FAILED", { message: "A template with this name and language already exists", hint: "Use a different name or language, or update the existing template." })`; Meta rejection (line 56) -> `apiError(reply, 400, "VALIDATION_FAILED", { message: metaMessage(err), hint: "Meta rejected the template. Fix the issue named in the message and send again." })`; Meta outage (line 58) -> `apiError(reply, 502, "META_UNAVAILABLE")`; edit/delete restrictions (176, 178, 208) keep their sentences, add `hint`s in the same call.

- [ ] **Step 4: Run to verify pass.** Update any older assertion that expected the bare `{api_id, error}` shape with `toEqual` to `toMatchObject`.

Run: `cd apps/api && pnpm vitest run src/routes/public-api src/lib/public-api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): error codes and hints for send and template errors"
```

---

### Task 5: Readable ErrorMessage on callbacks and message GET

**Files:**
- Modify: `apps/api/src/lib/public-api/meta-errors.ts`, `callbacks.ts:22-45`, `routes/public-api/messages.ts:62`
- Test: `meta-errors.test.ts` (create if absent), `callbacks.test.ts`, `messages.test.ts`

**Interfaces:**
- Produces: `errorMessageForCode(code: string | null): string | null` in `meta-errors.ts`; `StatusFieldArgs` unchanged (the message is derived inside `buildStatusFields` from `errorCode`); message object field `error_message: string | null`.

- [ ] **Step 1: Verify Meta texts.** Fetch Meta's error-code reference (https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes) and confirm the title and meaning of each code in the map below. Edit any sentence that does not match Meta. Codes whose meaning cannot be confirmed are removed from the map (they then fall through to the generic sentence).

- [ ] **Step 2: Write the failing tests** (`meta-errors.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { errorMessageForCode } from "./meta-errors.js";

describe("errorMessageForCode", () => {
  it("maps the 24-hour window code to a sentence that tells the client what to do", () => {
    expect(errorMessageForCode("380")).toMatch(/24 hours/);
    expect(errorMessageForCode("131047")).toMatch(/24 hours/);
  });
  it("gives a generic sentence that still contains an unknown Meta code", () => {
    expect(errorMessageForCode("139999")).toBe("WhatsApp could not deliver the message (code 139999).");
  });
  it("returns null for no code", () => { expect(errorMessageForCode(null)).toBeNull(); });
});
```

and in `callbacks.test.ts`: `buildStatusFields({ ...args, status: "failed", errorCode: "380" })` has `ErrorMessage` matching `/24 hours/`; a `delivered` status has no `ErrorMessage` key. In `messages.test.ts`: the GET message object for a failed row with `errorCode: "380"` has `error_message` matching `/24 hours/` and `error_code: 380`.

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/meta-errors.test.ts src/lib/public-api/callbacks.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement.** Append to `meta-errors.ts` (sentences to be confirmed in Step 1):

```ts
const MESSAGES: Record<string, string> = {
  "310": "The WhatsApp phone number is not registered.",
  "330": "WhatsApp does not support this message type for the recipient.",
  "340": "The template does not exist, is paused or is disabled. Check its status in WBMSG.",
  "350": "The template parameters do not match the template (count, format or length).",
  "360": "The WhatsApp Business account is locked or disabled. Contact support.",
  "370": "Sending limit reached. Slow down and retry later.",
  "380": "The customer has not replied in the last 24 hours, so only an approved template can be sent.",
  "131047": "The customer has not replied in the last 24 hours, so only an approved template can be sent.",
  "131049": "WhatsApp did not deliver this marketing message to this recipient right now. Try again later.",
  "131026": "The message could not be delivered. The recipient may not be on WhatsApp or may have blocked business messages.",
  "200": "Your WhatsApp Business account does not have permission to send this message. Contact support.",
};

/** Readable sentence for the ErrorCode we report to the client (Plivo-style 3xx or a passed-through Meta code). */
export function errorMessageForCode(code: string | null): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? `WhatsApp could not deliver the message (code ${code}).`;
}
```

In `callbacks.ts` `buildStatusFields` (the object at lines 33-44) after the `ErrorCode` spread add:

```ts
    ...((a.status === "failed" || a.status === "undelivered") && a.errorCode ? { ErrorMessage: errorMessageForCode(a.errorCode) ?? "" } : {}),
```

and import `errorMessageForCode` from `./meta-errors.js` (the file already imports `plivoErrorFromMeta`). In `messages.ts` `toMessageObject` (line 62) add next to `error_code`:

```ts
    error_message: errorMessageForCode(row.errorCode ?? null),
```

(import from `../../lib/public-api/meta-errors.js`). Note: signing is unaffected, because the signature is computed over the URL and nonce only (`callbacks worker`: `signV2(url, nonce, authToken)`).

- [ ] **Step 5: Run to verify pass and commit**

Run: `cd apps/api && pnpm vitest run src/routes/public-api src/lib/public-api src/workers`
Expected: PASS.

```bash
git add apps/api/src
git commit -m "feat(api): readable ErrorMessage on failure callbacks and message lookups"
```

---

### Task 6: Docs

**Files:** `docs/api/wbmsg-api-client-guide.md`, `.html`

- [ ] **Step 1:** Add an "Errors" section to the guide (both files): the body shape `{ "api_id", "error", "error_code", "hint" }` with a table of every `error_code` from `ERROR_CATALOG` (code, HTTP status, meaning, what to do), `Retry-After` on 429, `api_id` quoting for support, and the new `ErrorMessage` field in callbacks and `error_message` in message lookups.
- [ ] **Step 2:** Commit.

```bash
git add docs/api
git commit -m "docs: public API error codes, hints and ErrorMessage"
```

---

## Self-Review

- Spec coverage: error body + hint + code (T1), traceable api_id (T1; persisted into the log row by the logging plan), malformed JSON/415/429/500 (T2), auth/not-found (T3), validation/send/template errors (T4), async ErrorMessage (T5), docs (T6).
- Types: `ApiErrorCode`, `apiError`, `apiErrorBody`, `request.apiId`, `SendValidationError.code`, `errorMessageForCode` are defined once and used with the same names later.
- Placeholders: none, except Task 2 tests deliberately reuse helpers and setups that already exist in `index.test.ts` and `auth.test.ts`; the implementer must read those files first (instruction is in the task).
- Risk: response bodies change shape additively; clients that read only `error` keep working. Status codes are unchanged.
