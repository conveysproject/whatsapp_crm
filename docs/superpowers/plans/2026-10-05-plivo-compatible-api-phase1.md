# Plivo-compatible public API, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client call WBMSG with Plivo's WhatsApp message API (Basic auth, `POST/GET /v1/Account/{auth_id}/Message/`) and receive Plivo-style status callbacks and inbound forwards, against the client's own WABA.

**Architecture:** A new encapsulated Fastify plugin at `/v1/Account/:authId` with its own Basic-auth preHandler (routes marked `config.public` to skip Clerk). Credentials reuse the existing `api_keys` table. Sends are accepted with HTTP 202, stored as normal `messages` rows plus an `api_message_meta` row, sent to Meta by a BullMQ worker, and reported to the client by a second BullMQ queue that delivers signed (Plivo V2) form-encoded callbacks with Plivo's 60/120/240 s retry schedule.

**Tech Stack:** Fastify 4, Prisma 7 (adapter-pg), BullMQ 5, Vitest 1, Node `crypto`/`dns`, TypeScript ESM (imports end in `.js`).

**Spec:** `docs/prd-plivo-compatible-api.md` (approved 2026-10-05; decisions Q1, Q2, Q7, Q8, Q9 and defaults Q3-Q6 accepted).

**Scope of this plan:** Phase 1 only (credentials, `POST /Message/`, `GET /Message/`, `GET /Message/{uuid}/`, status callbacks, inbound forward). Templates API (Phase 2) and WABA event webhooks (Phase 3) get separate plans after Phase 1 ships. Tasks marked **[PROVISIONAL]** implement Plivo behavior inferred from public docs; they must be re-checked against the client's real samples (inbound webhook, interactive request, error body, send status code) before release.

## Global Constraints

- Public base path: `/v1/Account/{auth_id}/`; auth is HTTP Basic (`auth_id:auth_token`); JSON request bodies.
- Send success body exactly: `{"api_id": "<uuid>", "message": "message(s) queued", "message_uuid": ["<uuid>", ...]}` with HTTP 202 **[PROVISIONAL: status code]**.
- Public error body: `{"api_id": "<uuid>", "error": "<message>"}` **[PROVISIONAL]**, produced only by `plivoError()` in `lib/public-api/responses.ts` so it can be changed in one place.
- Status callbacks and inbound forwards are `application/x-www-form-urlencoded` POST (query string for GET), signed with headers `X-Plivo-Signature-V2` = base64(HMAC-SHA256(key = auth token, msg = scheme://host/path of the URL without query + nonce)), `X-Plivo-Signature-Ma-V2` (same value; we have no subaccounts), `X-Plivo-Signature-V2-Nonce`.
- Callback retries: 3 retries at +60 s, +120 s, +240 s (BullMQ `attempts: 4`, custom backoff). Success = any 2xx.
- Callback/inbound URLs: HTTPS only, no embedded credentials, DNS must not resolve to private/loopback/link-local/multicast ranges, no redirects followed, 10 s timeout.
- Organization is taken ONLY from the credential (`request.publicApi.organizationId`); no endpoint accepts an org id. Every Prisma query on tenant data includes `organizationId`.
- Max recipients per `dst` list: 20. Max text length: 4096. Only `type=whatsapp` is accepted.
- Phone numbers are stored as digits only (no `+`); use `normalizeFullPhone` from `lib/phone-normalize.ts`.
- API-created contacts/conversations are created silently: no assignment rules, routing, or automations.
- Feature flag `PUBLIC_API_ENABLED=true` (default off) registers the public routes and workers. Per-org gate: plan switch `api_access` (`isFeatureEnabled(prisma, orgId, "api_access")`).
- Auth token: 32 random bytes hex, shown once; DB stores `key_hash` (SHA-256 hex) and `token_enc` (AES-256-GCM, key from env `PUBLIC_API_TOKEN_KEY` = 32 bytes base64). Never log tokens, `token_enc`, or Meta access tokens.
- Migration is hand-authored SQL, additive only (local DB is drifted; never run `prisma migrate dev`). After any out-of-band DDL on prod run `prisma migrate resolve --applied <name>`.
- Tests: Vitest, mock Prisma/Redis/queues (see `apps/api/src/routes/labels.test.ts` pattern). Run from `apps/api`: `npx vitest run <file>`. Two pre-existing flaky API failures (segments/conversations) and Redis-rejection noise from auth-cache are known; report any other failure.
- Commits: end every commit message with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work on branch `feat/plivo-compatible-api`; finish by merging locally.

## Review Focus

1. `dst` containing duplicates, invalid numbers, empty segments or more than 20 entries: reject the whole request with 400 (no partial sends). Test in Task 8.
2. Path `authId` differs from the Basic username, or a message UUID belongs to another org: 401 / 404, never data. Tests in Tasks 5 and 12.
3. Callback URL resolving to a private IP, or answering 3xx, or timing out: no crash, no unbounded retries, never reaches an internal host. Tests in Tasks 3 and 10.
4. Meta rejects a send (24 h window, bad template params): message ends `failed`, a `failed` callback with the mapped Plivo `ErrorCode` is queued, no row stays `sending`. Test in Task 9.
5. Meta status webhooks arriving twice or out of order (read before delivered, failed after read): only forward transitions are forwarded, `Sequence` strictly increases, no duplicate callbacks. Test in Tasks 10 and 11.
6. `PUBLIC_API_TOKEN_KEY` missing or wrong length: credential creation returns 503, never stores or returns a token without an encrypted copy. Test in Task 7.

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` (modify) | `ApiKey` extra columns, `ApiMessageMeta` model, `Message.apiMeta` back-relation |
| `apps/api/prisma/migrations/20261005000000_public_api/migration.sql` (create) | Additive DDL |
| `apps/api/src/lib/public-api/credentials.ts` (+test) | Token generate/hash/compare/encrypt/decrypt |
| `apps/api/src/lib/public-api/plivo-signature.ts` (+test) | V2 signing |
| `apps/api/src/lib/public-api/safe-url.ts` (+test) | SSRF-safe URL validation |
| `apps/api/src/lib/public-api/meta-errors.ts` (+test) | Meta error code -> Plivo ErrorCode |
| `apps/api/src/lib/public-api/responses.ts` | `newApiId`, `plivoError` |
| `apps/api/src/lib/public-api/send-mapping.ts` (+test) | Validate Plivo send body; map template/interactive to Meta; inbox rendering |
| `apps/api/src/lib/public-api/queues.ts` | `publicApiSendQueue`, `publicApiCallbackQueue` |
| `apps/api/src/lib/public-api/callbacks.ts` (+test) | Ratchet + enqueue status callbacks, forward Meta statuses, forward inbound |
| `apps/api/src/lib/whatsapp.ts` (modify) | Typed `WaApiError`, `sendLocationMessage`, widened payload types |
| `apps/api/src/routes/public-api/auth.ts` (+test) | Basic-auth preHandler |
| `apps/api/src/routes/public-api/messages.ts` (+test) | `POST/GET /Message/`, `GET /Message/:uuid/` |
| `apps/api/src/routes/public-api/index.ts` (+test) | Plugin: rate limit + auth hook + routes |
| `apps/api/src/routes/api-credentials.ts` (+test) | Clerk-authenticated credential management |
| `apps/api/src/workers/public-api-send.worker.ts` (+test) | Sends accepted messages to Meta |
| `apps/api/src/workers/public-api-callbacks.worker.ts` (+test) | Delivers signed callbacks with retry |
| `apps/api/src/routes/webhooks.ts` (modify) | Forward Meta statuses of API messages |
| `apps/api/src/workers/inbound-message.worker.ts` (modify) | Forward inbound messages |
| `apps/api/src/routes/index.ts`, `apps/api/src/index.ts`, `apps/api/src/lib/impersonation-guard.ts`, `apps/api/src/types/fastify.d.ts`, `.env.example` (modify) | Wiring |

---

### Task 1: Branch, migration and Prisma schema

**Files:**
- Create: `apps/api/prisma/migrations/20261005000000_public_api/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (ApiKey at ~line 841, Message at ~line 265)

**Interfaces:**
- Produces: Prisma models `ApiKey` (+ `revokedAt`, `createdBy`, `tokenEnc`, `callbackUrl`, `inboundUrl`) and `ApiMessageMeta` (`messageId` PK, `apiKeyId`, `organizationId`, `dst`, `callbackUrl`, `callbackMethod`, `errorCode`, `lastStatus`, `sequence`, `queuedAt`, `sentAt`, `deliveryReportAt`); `Message.apiMeta`.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/plivo-compatible-api
```
(The untracked `.claude/skills/` and the PRD file travel with the working tree; do not add `.claude/skills/`.)

- [ ] **Step 2: Write the migration SQL**

`apps/api/prisma/migrations/20261005000000_public_api/migration.sql`:
```sql
-- Public (Plivo-compatible) API: extend api_keys, add per-message API metadata.
ALTER TABLE "api_keys"
  ADD COLUMN "revoked_at"   TIMESTAMP(3),
  ADD COLUMN "created_by"   TEXT,
  ADD COLUMN "token_enc"    TEXT,
  ADD COLUMN "callback_url" TEXT,
  ADD COLUMN "inbound_url"  TEXT;

CREATE TABLE "api_message_meta" (
  "message_id"         TEXT NOT NULL,
  "api_key_id"         TEXT NOT NULL,
  "organization_id"    TEXT NOT NULL,
  "dst"                TEXT NOT NULL,
  "callback_url"       TEXT,
  "callback_method"    TEXT NOT NULL DEFAULT 'POST',
  "error_code"         TEXT,
  "last_status"        TEXT,
  "sequence"           INTEGER NOT NULL DEFAULT 0,
  "queued_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at"            TIMESTAMP(3),
  "delivery_report_at" TIMESTAMP(3),
  CONSTRAINT "api_message_meta_pkey" PRIMARY KEY ("message_id")
);

CREATE INDEX "api_message_meta_organization_id_queued_at_idx" ON "api_message_meta"("organization_id", "queued_at");
CREATE INDEX "api_message_meta_api_key_id_idx" ON "api_message_meta"("api_key_id");

ALTER TABLE "api_message_meta"
  ADD CONSTRAINT "api_message_meta_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Update `ApiKey` in `schema.prisma`**

Replace the model at ~line 841 with:
```prisma
model ApiKey {
  id             String    @id @default(uuid())
  organizationId String    @map("organization_id")
  name           String
  keyHash        String    @unique @map("key_hash")
  scopes         String[]
  lastUsedAt     DateTime? @map("last_used_at")
  revokedAt      DateTime? @map("revoked_at")
  createdBy      String?   @map("created_by")
  tokenEnc       String?   @map("token_enc")
  callbackUrl    String?   @map("callback_url")
  inboundUrl     String?   @map("inbound_url")
  createdAt      DateTime  @default(now()) @map("created_at")

  @@index([organizationId])
  @@map("api_keys")
}

model ApiMessageMeta {
  messageId        String    @id @map("message_id")
  message          Message   @relation(fields: [messageId], references: [id], onDelete: Cascade)
  apiKeyId         String    @map("api_key_id")
  organizationId   String    @map("organization_id")
  dst              String
  callbackUrl      String?   @map("callback_url")
  callbackMethod   String    @default("POST") @map("callback_method")
  errorCode        String?   @map("error_code")
  lastStatus       String?   @map("last_status")
  sequence         Int       @default(0)
  queuedAt         DateTime  @default(now()) @map("queued_at")
  sentAt           DateTime? @map("sent_at")
  deliveryReportAt DateTime? @map("delivery_report_at")

  @@index([organizationId, queuedAt])
  @@index([apiKeyId])
  @@map("api_message_meta")
}
```

- [ ] **Step 4: Add the back-relation on `Message`**

Inside `model Message { ... }` (after `labels         MessageLabel[]`) add:
```prisma
  apiMeta        ApiMessageMeta?
```

- [ ] **Step 5: Validate and generate**

Run (from `apps/api`): `npx prisma validate && npx prisma generate`
Expected: "The schema ... is valid" and "Generated Prisma Client".

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261005000000_public_api
git commit -m "feat(public-api): add api_keys columns and api_message_meta table" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Credential crypto helpers

**Files:**
- Create: `apps/api/src/lib/public-api/credentials.ts`
- Test: `apps/api/src/lib/public-api/credentials.test.ts`

**Interfaces:**
- Produces: `newAuthToken(): string`, `hashToken(token: string): string`, `tokenMatchesHash(token: string, hash: string): boolean`, `encryptToken(token: string): string`, `decryptToken(enc: string): string`, `class TokenKeyError extends Error`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { newAuthToken, hashToken, tokenMatchesHash, encryptToken, decryptToken, TokenKeyError } from "./credentials.js";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("credentials", () => {
  beforeEach(() => { process.env["PUBLIC_API_TOKEN_KEY"] = KEY; });

  it("generates unique 64-char hex tokens", () => {
    const a = newAuthToken();
    const b = newAuthToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("hash matches only the right token", () => {
    const t = newAuthToken();
    const h = hashToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenMatchesHash(t, h)).toBe(true);
    expect(tokenMatchesHash(t + "x", h)).toBe(false);
    expect(tokenMatchesHash("", h)).toBe(false);
  });

  it("encrypt/decrypt round-trips and uses a random IV", () => {
    const t = newAuthToken();
    const e1 = encryptToken(t);
    const e2 = encryptToken(t);
    expect(e1).not.toBe(e2);
    expect(decryptToken(e1)).toBe(t);
  });

  it("rejects tampered ciphertext", () => {
    const [iv, tag, ct] = encryptToken("secret").split(".");
    const flipped = Buffer.from(ct!, "base64");
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() => decryptToken(`${iv}.${tag}.${flipped.toString("base64")}`)).toThrow();
  });

  it("throws TokenKeyError when the key is missing or the wrong length", () => {
    delete process.env["PUBLIC_API_TOKEN_KEY"];
    expect(() => encryptToken("x")).toThrow(TokenKeyError);
    process.env["PUBLIC_API_TOKEN_KEY"] = Buffer.alloc(16).toString("base64");
    expect(() => encryptToken("x")).toThrow(TokenKeyError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/public-api/credentials.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export class TokenKeyError extends Error {}

export function newAuthToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatchesHash(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function encryptionKey(): Buffer {
  const key = Buffer.from(process.env["PUBLIC_API_TOKEN_KEY"] ?? "", "base64");
  if (key.length !== 32) throw new TokenKeyError("PUBLIC_API_TOKEN_KEY must be 32 bytes, base64-encoded");
  return key;
}

/** AES-256-GCM. Format: base64(iv).base64(tag).base64(ciphertext). */
export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

export function decryptToken(enc: string): string {
  const [iv, tag, ct] = enc.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !ct) throw new Error("malformed token_enc");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/public-api/credentials.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/public-api/credentials.ts apps/api/src/lib/public-api/credentials.test.ts
git commit -m "feat(public-api): credential token hashing and encryption helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Plivo V2 signature and SSRF-safe URL validation

**Files:**
- Create: `apps/api/src/lib/public-api/plivo-signature.ts`, `apps/api/src/lib/public-api/safe-url.ts`
- Test: `apps/api/src/lib/public-api/plivo-signature.test.ts`, `apps/api/src/lib/public-api/safe-url.test.ts`

**Interfaces:**
- Produces: `signV2(url: string, nonce: string, authToken: string): string`, `newNonce(): string`; `class UnsafeUrlError extends Error`, `isPrivateIp(ip: string): boolean`, `assertSafeCallbackUrl(raw: string): Promise<URL>`.

- [ ] **Step 1: Write the failing signature test**

The expected value below was computed independently with Python (`hmac.new(b"token123", (uri+nonce).encode(), sha256)` then base64), mirroring Plivo's `validate_signature`.

```ts
import { describe, it, expect } from "vitest";
import { signV2, newNonce } from "./plivo-signature.js";

describe("plivo V2 signature", () => {
  it("matches the independently computed reference vector", () => {
    expect(signV2("https://example.com/hooks/plivo", "12345678901234567890", "token123"))
      .toBe("zE14putzDAofHnAy32hbEsqed/bTl+2AHh0rZCBayVE=");
  });

  it("ignores the query string and fragment", () => {
    expect(signV2("https://example.com/hooks/plivo?x=1#f", "12345678901234567890", "token123"))
      .toBe("zE14putzDAofHnAy32hbEsqed/bTl+2AHh0rZCBayVE=");
  });

  it("changes with the token and the nonce", () => {
    const base = signV2("https://example.com/h", "1", "a");
    expect(signV2("https://example.com/h", "1", "b")).not.toBe(base);
    expect(signV2("https://example.com/h", "2", "a")).not.toBe(base);
  });

  it("nonce is a 20-digit numeric string", () => {
    expect(newNonce()).toMatch(/^\d{20}$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**, `npx vitest run src/lib/public-api/plivo-signature.test.ts` (module not found).

- [ ] **Step 3: Implement `plivo-signature.ts`**

```ts
import { createHmac, randomInt } from "node:crypto";

/** scheme://host/path with no query or fragment (mirrors plivo-python `urlunparse((scheme, netloc, path, '', '', ''))`). */
function baseUrl(url: string): string {
  return url.split(/[?#]/)[0] ?? url;
}

export function signV2(url: string, nonce: string, authToken: string): string {
  return createHmac("sha256", authToken).update(baseUrl(url) + nonce).digest("base64");
}

export function newNonce(): string {
  return `${randomInt(0, 1e10)}${randomInt(0, 1e10)}`.padStart(20, "0");
}
```

- [ ] **Step 4: Run to verify it passes**, same command, expect PASS.

- [ ] **Step 5: Cross-check against Plivo's own SDK (one-time, not committed)**

```bash
python -m pip install plivo
python -c "import plivo; print(plivo.utils.validate_signature('https://example.com/hooks/plivo','12345678901234567890','zE14putzDAofHnAy32hbEsqed/bTl+2AHh0rZCBayVE=','token123'))"
```
Expected: `True`. If `False` or the call signature differs, stop and report (the vector or the algorithm is wrong).

- [ ] **Step 6: Write the failing SSRF test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
import { lookup } from "node:dns/promises";
import { isPrivateIp, assertSafeCallbackUrl, UnsafeUrlError } from "./safe-url.js";

const lookupMock = vi.mocked(lookup) as unknown as ReturnType<typeof vi.fn>;

describe("isPrivateIp", () => {
  it.each(["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "172.31.255.255", "192.168.1.1", "0.0.0.0", "100.64.0.1", "224.0.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12::1", "::ffff:10.0.0.1"])
    ("%s is private", (ip) => { expect(isPrivateIp(ip)).toBe(true); });
  it.each(["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])
    ("%s is public", (ip) => { expect(isPrivateIp(ip)).toBe(false); });
});

describe("assertSafeCallbackUrl", () => {
  it("accepts an https URL resolving to public IPs", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const u = await assertSafeCallbackUrl("https://client.example.com/hook");
    expect(u.hostname).toBe("client.example.com");
  });
  it("rejects http, credentials, and garbage", async () => {
    await expect(assertSafeCallbackUrl("http://client.example.com/h")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeCallbackUrl("https://u:p@client.example.com/h")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeCallbackUrl("not a url")).rejects.toThrow(UnsafeUrlError);
  });
  it("rejects when ANY resolved address is private", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }]);
    await expect(assertSafeCallbackUrl("https://evil.example.com/h")).rejects.toThrow(UnsafeUrlError);
  });
  it("rejects a literal private IP host without a DNS lookup", async () => {
    lookupMock.mockClear();
    await expect(assertSafeCallbackUrl("https://127.0.0.1/h")).rejects.toThrow(UnsafeUrlError);
    expect(lookupMock).not.toHaveBeenCalled();
  });
  it("rejects when DNS fails", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertSafeCallbackUrl("https://nope.example.com/h")).rejects.toThrow(UnsafeUrlError);
  });
});
```

- [ ] **Step 7: Run to verify it fails**, `npx vitest run src/lib/public-api/safe-url.test.ts`.

- [ ] **Step 8: Implement `safe-url.ts`**

```ts
import { lookup } from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {}

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    a >= 224
  );
}

export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v === 6) {
    const lower = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return ipv4Private(mapped[1]!);
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  return true; // not an IP: treat as unsafe
}

/**
 * HTTPS only, no credentials, and every resolved address must be public.
 * Residual risk: DNS can change between this check and the request (rebinding);
 * callers must validate immediately before fetching and never follow redirects.
 */
export async function assertSafeCallbackUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new UnsafeUrlError("invalid URL"); }
  if (url.protocol !== "https:") throw new UnsafeUrlError("URL must be https");
  if (url.username || url.password) throw new UnsafeUrlError("URL must not contain credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new UnsafeUrlError("URL resolves to a private address");
    return url;
  }
  let addrs: Array<{ address: string }>;
  try { addrs = await lookup(host, { all: true }); } catch { throw new UnsafeUrlError("host does not resolve"); }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new UnsafeUrlError("URL resolves to a private address");
  }
  return url;
}
```

- [ ] **Step 9: Run both test files**, `npx vitest run src/lib/public-api/`, expect all PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/lib/public-api/plivo-signature.ts apps/api/src/lib/public-api/plivo-signature.test.ts apps/api/src/lib/public-api/safe-url.ts apps/api/src/lib/public-api/safe-url.test.ts
git commit -m "feat(public-api): Plivo V2 signing and SSRF-safe callback URL validation" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Typed Meta errors, location sender, error-code mapping

**Files:**
- Modify: `apps/api/src/lib/whatsapp.ts` (lines 15-163 send functions; types at 87-101)
- Create: `apps/api/src/lib/public-api/meta-errors.ts`, `apps/api/src/lib/public-api/responses.ts`
- Test: `apps/api/src/lib/public-api/meta-errors.test.ts`, `apps/api/src/lib/whatsapp.test.ts` (create)

**Interfaces:**
- Produces: `class WaApiError extends Error { metaCode: number | null; metaSubcode: number | null }`; `sendLocationMessage(phoneNumberId, to, location: { latitude: string; longitude: string; name: string; address: string }, accessToken): Promise<{ messageId: string }>`; `plivoErrorFromMeta(metaCode: number | null | undefined): string | null`; `newApiId(): string`; `plivoError(reply, status, message)`.
- Existing callers keep working: error messages keep their current text.

- [ ] **Step 1: Write the failing whatsapp tests**

`apps/api/src/lib/whatsapp.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./prisma.js", () => ({ prisma: {} }));
vi.mock("./register-phone-enqueue.js", () => ({ onPhoneStatusPending: vi.fn() }));
import { sendTextMessage, sendLocationMessage, WaApiError } from "./whatsapp.js";

afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch(status: number, json: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => json });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("WaApiError", () => {
  it("send failures carry the Meta error code but keep the old message format", async () => {
    stubFetch(400, { error: { code: 131047, error_subcode: 2494, message: "Re-engagement" } });
    const err = await sendTextMessage("pn", "919999999999", "hi", "tok").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WaApiError);
    expect((err as WaApiError).metaCode).toBe(131047);
    expect((err as WaApiError).metaSubcode).toBe(2494);
    expect((err as Error).message.startsWith("WA send failed: ")).toBe(true);
  });

  it("tolerates a non-JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error("bad json"); } }));
    const err = await sendTextMessage("pn", "1", "x", "tok").catch((e: unknown) => e);
    expect((err as WaApiError).metaCode).toBeNull();
  });
});

describe("sendLocationMessage", () => {
  it("posts a Meta location message", async () => {
    const fetchFn = stubFetch(200, { messages: [{ id: "wamid.1" }] });
    const r = await sendLocationMessage("pn", "919999999999", { latitude: "12.9", longitude: "77.6", name: "HQ", address: "MG Road" }, "tok");
    expect(r.messageId).toBe("wamid.1");
    const body = JSON.parse((fetchFn.mock.calls[0]![1] as { body: string }).body) as Record<string, unknown>;
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "919999999999", type: "location", location: { latitude: 12.9, longitude: 77.6, name: "HQ", address: "MG Road" } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**, `npx vitest run src/lib/whatsapp.test.ts` (`WaApiError`/`sendLocationMessage` not exported).

- [ ] **Step 3: Edit `lib/whatsapp.ts`**

3a. Below `interface WaMessageResponse { ... }` add:
```ts
export class WaApiError extends Error {
  constructor(message: string, readonly metaCode: number | null, readonly metaSubcode: number | null) {
    super(message);
    this.name = "WaApiError";
  }
}

async function waError(prefix: string, res: Response): Promise<WaApiError> {
  const err = (await res.json().catch(() => ({}))) as { error?: { code?: number; error_subcode?: number } };
  return new WaApiError(`${prefix}: ${JSON.stringify(err)}`, err.error?.code ?? null, err.error?.error_subcode ?? null);
}
```

3b. In each of the four send functions replace the two-line failure block with the helper. Exact replacements (the `const err = ...` line and the `throw` line):
- `sendTextMessage` (lines 38-39): `throw await waError("WA send failed", res);`
- `sendMediaMessage` (lines 80-81): `throw await waError("WA media send failed", res);`
- `sendTemplateMessage` (lines 130-131): `throw await waError("WA template send failed", res);`
- `sendInteractiveMessage` (lines 158-159): `throw await waError("WA interactive send failed", res);`
(Delete the `const err = await res.json() as unknown;` line in each.)

3c. Widen types (additive):
```ts
export interface WaInteractivePayload {
  type: "button" | "list" | "cta_url";
  header?:
    | { type: "text"; text: string }
    | { type: "image" | "video" | "document"; image?: { link: string }; video?: { link: string }; document?: { link: string } };
  body: { text: string };
  footer?: { text: string };
  action: Record<string, unknown>;
}

export interface WaTemplateComponent {
  type: "header" | "body" | "button" | "carousel";
  sub_type?: string;
  index?: number;
  parameters?: Array<{
    type: "text" | "image" | "video" | "document" | "payload";
    text?: string;
    payload?: string;
    image?: { link: string };
    video?: { link: string };
    document?: { link: string };
  }>;
  cards?: Array<{ card_index: number; components: WaTemplateComponent[] }>;
}
```

3d. After `sendInteractiveMessage` add:
```ts
export async function sendLocationMessage(
  phoneNumberId: string,
  to: string,
  location: { latitude: string; longitude: string; name: string; address: string },
  accessToken: string
): Promise<WaSendResult> {
  const res = await fetch(`${WA_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "location",
      location: {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        name: location.name,
        address: location.address,
      },
    }),
  });
  if (!res.ok) throw await waError("WA location send failed", res);
  const data = await res.json() as WaMessageResponse;
  return { messageId: data.messages[0]!.id };
}
```

- [ ] **Step 4: Run whatsapp tests and the type-check**

Run: `npx vitest run src/lib/whatsapp.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors. If `tsc` reports code reading `interactive.header.text` (union widened), narrow it with `header.type === "text"` at that site (grep `header?.text` / `\.header\.text` in `src/`).

- [ ] **Step 5: Write the failing mapping test**

`apps/api/src/lib/public-api/meta-errors.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { plivoErrorFromMeta } from "./meta-errors.js";

describe("plivoErrorFromMeta", () => {
  it.each([
    [131047, "380"], [132001, "340"], [132000, "350"], [133010, "310"],
    [131031, "360"], [130429, "370"], [131056, "370"], [131051, "330"],
  ])("maps Meta %i to Plivo %s", (meta, plivo) => { expect(plivoErrorFromMeta(meta)).toBe(plivo); });
  it("returns null for unknown or missing codes", () => {
    expect(plivoErrorFromMeta(999999)).toBeNull();
    expect(plivoErrorFromMeta(null)).toBeNull();
    expect(plivoErrorFromMeta(undefined)).toBeNull();
  });
});
```

- [ ] **Step 6: Implement `meta-errors.ts` and `responses.ts`**

```ts
// meta-errors.ts
// VERIFY every Meta code below against Meta's Cloud API error-code reference before release
// (https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes). Plivo codes come from Plivo's error-code page.
const META_TO_PLIVO: Record<number, string> = {
  133010: "310", // phone number not registered
  131031: "360", // business account locked / disabled
  131051: "330", // unsupported message type
  132001: "340", // template does not exist
  132015: "340", // template paused
  132016: "340", // template disabled
  132000: "350", // template parameter count mismatch
  132005: "350", // translated text too long
  132012: "350", // template parameter format mismatch
  130429: "370", // Cloud API throughput reached
  131056: "370", // pair rate limit
  131048: "370", // spam rate limit
  131047: "380", // re-engagement: >24h since last customer reply
};

export function plivoErrorFromMeta(metaCode: number | null | undefined): string | null {
  return metaCode == null ? null : (META_TO_PLIVO[metaCode] ?? null);
}
```
```ts
// responses.ts
import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";

export function newApiId(): string {
  return randomUUID();
}

/** Single place for the public error body shape. PROVISIONAL: confirm against a real Plivo error response from the client. */
export function plivoError(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).send({ api_id: newApiId(), error: message });
}
```

- [ ] **Step 7: Run all, then commit**

Run: `npx vitest run src/lib/public-api src/lib/whatsapp.test.ts && npx tsc --noEmit` (expect PASS).
```bash
git add apps/api/src/lib/whatsapp.ts apps/api/src/lib/whatsapp.test.ts apps/api/src/lib/public-api/meta-errors.ts apps/api/src/lib/public-api/meta-errors.test.ts apps/api/src/lib/public-api/responses.ts
git commit -m "feat(whatsapp): typed Meta errors, location sender, Plivo error-code map" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Basic-auth preHandler

**Files:**
- Create: `apps/api/src/routes/public-api/auth.ts`
- Modify: `apps/api/src/types/fastify.d.ts`
- Test: `apps/api/src/routes/public-api/auth.test.ts`

**Interfaces:**
- Consumes: `tokenMatchesHash`, `hashToken` (Task 2), `plivoError` (Task 4), `isFeatureEnabled` (`lib/plan-limits.ts:42`).
- Produces: `publicApiAuth(request, reply)` preHandler; `request.publicApi: { apiKeyId: string; organizationId: string }`.

- [ ] **Step 1: Extend the request type**

In `types/fastify.d.ts` inside `interface FastifyRequest` add:
```ts
    /** Set by the public API Basic-auth preHandler. */
    publicApi?: { apiKeyId: string; organizationId: string };
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { hashToken } from "../../lib/public-api/credentials.js";
import { publicApiAuth } from "./auth.js";

const mockPrisma = {
  apiKey: { findUnique: vi.fn(), update: vi.fn() },
  organization: { findUnique: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
};

const ID = "11111111-1111-1111-1111-111111111111";
const basic = (id: string, token: string) => `Basic ${Buffer.from(`${id}:${token}`).toString("base64")}`;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  await app.register(async (f) => {
    f.addHook("preHandler", publicApiAuth);
    f.get("/ping", async (req) => req.publicApi);
  }, { prefix: "/v1/Account/:authId" });
  return app;
}

describe("publicApiAuth", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: ID, organizationId: "org-1", keyHash: hashToken("good-token"), revokedAt: null, lastUsedAt: null });
    mockPrisma.apiKey.update.mockResolvedValue({});
    mockPrisma.organization.findUnique.mockResolvedValue({ status: "active" });
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "1" });
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  const get = (auth?: string, id = ID) =>
    app.inject({ method: "GET", url: `/v1/Account/${id}/ping`, headers: auth ? { authorization: auth } : {} });

  it("accepts valid credentials and exposes the org", async () => {
    const res = await get(basic(ID, "good-token"));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ apiKeyId: ID, organizationId: "org-1" });
  });

  it("401 with no header, wrong token, or garbage header", async () => {
    for (const h of [undefined, basic(ID, "bad"), "Basic !!!", "Bearer x"]) {
      const res = await get(h);
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: expect.any(String), api_id: expect.any(String) });
    }
  });

  it("401 when the URL auth id differs from the Basic username (no lookup of the URL id)", async () => {
    const other = "22222222-2222-2222-2222-222222222222";
    const res = await get(basic(ID, "good-token"), other);
    expect(res.statusCode).toBe(401);
    expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("401 for an unknown or revoked credential", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce(null);
    expect((await get(basic(ID, "good-token"))).statusCode).toBe(401);
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({ id: ID, organizationId: "org-1", keyHash: hashToken("good-token"), revokedAt: new Date(), lastUsedAt: null });
    expect((await get(basic(ID, "good-token"))).statusCode).toBe(401);
  });

  it("403 when the org is not active or api_access is off", async () => {
    mockPrisma.organization.findUnique.mockResolvedValueOnce({ status: "banned" });
    expect((await get(basic(ID, "good-token"))).statusCode).toBe(403);
    mockPrisma.vendorSetting.findFirst.mockResolvedValueOnce(null);
    expect((await get(basic(ID, "good-token"))).statusCode).toBe(403);
  });
});
```

- [ ] **Step 3: Run to verify it fails**, `npx vitest run src/routes/public-api/auth.test.ts`.

- [ ] **Step 4: Implement `auth.ts`**

```ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { tokenMatchesHash } from "../../lib/public-api/credentials.js";
import { plivoError } from "../../lib/public-api/responses.js";
import { isFeatureEnabled } from "../../lib/plan-limits.js";

const DUMMY_HASH = "0".repeat(64); // keeps the compare cost constant when the credential does not exist
const LAST_USED_REFRESH_MS = 5 * 60 * 1000;
const BAD_CREDENTIALS = "Authentication credentials were not provided or are invalid";

export async function publicApiAuth(
  request: FastifyRequest<{ Params: { authId: string } }>,
  reply: FastifyReply
) {
  const m = /^Basic\s+(\S+)$/i.exec(request.headers.authorization ?? "");
  const decoded = m ? Buffer.from(m[1]!, "base64").toString("utf8") : "";
  const sep = decoded.indexOf(":");
  const authId = sep === -1 ? "" : decoded.slice(0, sep);
  const token = sep === -1 ? "" : decoded.slice(sep + 1);

  // The credential is only ever looked up by the id the caller proved knowledge of AND that matches the URL.
  const row = authId && authId === request.params.authId
    ? await request.server.prisma.apiKey.findUnique({ where: { id: authId } })
    : null;
  const hashOk = tokenMatchesHash(token, row?.keyHash ?? DUMMY_HASH);
  if (!row || !hashOk || row.revokedAt) return plivoError(reply, 401, BAD_CREDENTIALS);

  const org = await request.server.prisma.organization.findUnique({
    where: { id: row.organizationId },
    select: { status: true },
  });
  if (org?.status !== "active") return plivoError(reply, 403, "Account is not active");
  if (!(await isFeatureEnabled(request.server.prisma, row.organizationId, "api_access"))) {
    return plivoError(reply, 403, "API access is not enabled for this account");
  }

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
    void request.server.prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
  request.publicApi = { apiKeyId: row.id, organizationId: row.organizationId };
}
```

- [ ] **Step 5: Run to verify it passes**, `npx vitest run src/routes/public-api/auth.test.ts` (expect 5 tests PASS).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/public-api/auth.ts apps/api/src/routes/public-api/auth.test.ts apps/api/src/types/fastify.d.ts
git commit -m "feat(public-api): Basic-auth preHandler with org/plan gating" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Credential management routes (Clerk-authenticated)

**Files:**
- Create: `apps/api/src/routes/api-credentials.ts`
- Modify: `apps/api/src/lib/impersonation-guard.ts` (`BLOCKED_PREFIXES`, line 41-58), `apps/api/src/routes/index.ts`
- Test: `apps/api/src/routes/api-credentials.test.ts`

**Interfaces:**
- Consumes: `newAuthToken`, `hashToken`, `encryptToken`, `TokenKeyError` (Task 2); `assertSafeCallbackUrl`, `UnsafeUrlError` (Task 3); `canAccessSub` (`lib/permissions.ts:41`); `isFeatureEnabled`; `writeAdminAudit` (`lib/audit.ts:15`).
- Produces: `apiCredentialsRouter` with `POST /api-credentials`, `GET /api-credentials`, `PATCH /api-credentials/:id`, `POST /api-credentials/:id/rotate`, `DELETE /api-credentials/:id` (revoke). Responses use the dashboard shape `{ data: ... }` / `{ error: { code, message } }`. Create/rotate return `data.authToken` exactly once.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/audit.js", () => ({ writeAdminAudit: vi.fn() }));
vi.mock("../lib/public-api/safe-url.js", async (orig) => {
  const real = await orig<typeof import("../lib/public-api/safe-url.js")>();
  return { ...real, assertSafeCallbackUrl: vi.fn(async (u: string) => { if (u.includes("bad")) throw new real.UnsafeUrlError("unsafe"); return new URL(u); }) };
});

const mockPrisma = {
  apiKey: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
};

async function buildApp(role = "admin", permissions: Record<string, string> = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => {
    r.auth = { userId: "u-1", organizationId: "org-1", role: role as "admin", permissions, teamId: null, teamRole: null };
  });
  const { apiCredentialsRouter } = await import("./api-credentials.js");
  await app.register(apiCredentialsRouter, { prefix: "/v1" });
  return app;
}

describe("api-credentials", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    process.env["PUBLIC_API_TOKEN_KEY"] = Buffer.alloc(32, 9).toString("base64");
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "1" }); // api_access on
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("creates a credential, returns the token once, stores hash + encrypted copy scoped to the org", async () => {
    mockPrisma.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "key-1", name: data["name"], createdAt: new Date() }));
    const res = await app.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "Prod" } });
    expect(res.statusCode).toBe(201);
    const { data } = res.json<{ data: { authId: string; authToken: string } }>();
    expect(data.authId).toBe("key-1");
    expect(data.authToken).toMatch(/^[0-9a-f]{64}$/);
    const arg = mockPrisma.apiKey.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(arg["organizationId"]).toBe("org-1");
    expect(arg["keyHash"]).toMatch(/^[0-9a-f]{64}$/);
    expect(arg["keyHash"]).not.toBe(data.authToken);
    expect(typeof arg["tokenEnc"]).toBe("string");
    expect(JSON.stringify(arg)).not.toContain(data.authToken);
  });

  it("503 and nothing stored when PUBLIC_API_TOKEN_KEY is missing", async () => {
    delete process.env["PUBLIC_API_TOKEN_KEY"];
    const res = await app.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "Prod" } });
    expect(res.statusCode).toBe(503);
    expect(mockPrisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("403 when api_access is off", async () => {
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "Prod" } });
    expect(res.statusCode).toBe(403);
  });

  it("denies non-admin without the sub-permission, allows with it", async () => {
    const denied = await buildApp("agent", { settings_access: "allow" });
    expect((await denied.inject({ method: "GET", url: "/v1/api-credentials" })).statusCode).toBe(403);
    await denied.close();
    mockPrisma.apiKey.findMany.mockResolvedValue([]);
    const allowed = await buildApp("agent", { settings_access: "allow", "settings_access@api_credentials": "allow" });
    expect((await allowed.inject({ method: "GET", url: "/v1/api-credentials" })).statusCode).toBe(200);
    await allowed.close();
  });

  it("rejects an unsafe callback URL", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/api-credentials", payload: { name: "P", callbackUrl: "https://bad.example.com/h" } });
    expect(res.statusCode).toBe(400);
  });

  it("list never returns hashes or encrypted tokens and is org-scoped", async () => {
    mockPrisma.apiKey.findMany.mockResolvedValue([]);
    await app.inject({ method: "GET", url: "/v1/api-credentials" });
    const q = mockPrisma.apiKey.findMany.mock.calls[0]![0] as { where: Record<string, unknown>; select: Record<string, unknown> };
    expect(q.where["organizationId"]).toBe("org-1");
    expect(q.select["keyHash"]).toBeUndefined();
    expect(q.select["tokenEnc"]).toBeUndefined();
  });

  it("PATCH/rotate/revoke 404 for a credential of another org", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);
    expect((await app.inject({ method: "PATCH", url: "/v1/api-credentials/k", payload: { name: "x" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/v1/api-credentials/k/rotate" })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: "/v1/api-credentials/k" })).statusCode).toBe(404);
    expect(mockPrisma.apiKey.findFirst.mock.calls[0]![0].where).toMatchObject({ id: "k", organizationId: "org-1" });
  });

  it("revoke sets revokedAt instead of deleting", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({ id: "k" });
    mockPrisma.apiKey.update.mockResolvedValue({});
    const res = await app.inject({ method: "DELETE", url: "/v1/api-credentials/k" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.apiKey.update.mock.calls[0]![0].data.revokedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run to verify it fails**, `npx vitest run src/routes/api-credentials.test.ts`.

- [ ] **Step 3: Implement `routes/api-credentials.ts`**

```ts
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { isFeatureEnabled } from "../lib/plan-limits.js";
import { writeAdminAudit } from "../lib/audit.js";
import { assertSafeCallbackUrl, UnsafeUrlError } from "../lib/public-api/safe-url.js";
import { encryptToken, hashToken, newAuthToken, TokenKeyError } from "../lib/public-api/credentials.js";

interface CredentialBody { name?: string; callbackUrl?: string | null; inboundUrl?: string | null }

const LIST_SELECT = {
  id: true, name: true, callbackUrl: true, inboundUrl: true, lastUsedAt: true, revokedAt: true, createdAt: true,
} as const;

async function validUrl(reply: FastifyReply, url: string | null | undefined, field: string): Promise<boolean> {
  if (url == null || url === "") return true;
  try { await assertSafeCallbackUrl(url); return true; }
  catch (err) {
    if (!(err instanceof UnsafeUrlError)) throw err;
    await reply.status(400).send({ error: { code: "INVALID_URL", message: `${field}: ${err.message}` } });
    return false;
  }
}

export const apiCredentialsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const { role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "api_credentials")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "api_credentials permission required" } });
    }
    if (!(await isFeatureEnabled(fastify.prisma, request.auth.organizationId, "api_access"))) {
      return reply.status(403).send({ error: { code: "PLAN_REQUIRED", message: "API access is not enabled for this plan" } });
    }
  });

  fastify.get("/api-credentials", async (request, reply) => {
    const data = await fastify.prisma.apiKey.findMany({
      where: { organizationId: request.auth.organizationId },
      select: LIST_SELECT,
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: CredentialBody }>("/api-credentials", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const { name, callbackUrl, inboundUrl } = request.body ?? {};
    if (!name?.trim()) return reply.status(400).send({ error: { code: "MISSING_NAME", message: "name is required" } });
    if (!(await validUrl(reply, callbackUrl, "callbackUrl"))) return reply;
    if (!(await validUrl(reply, inboundUrl, "inboundUrl"))) return reply;

    const token = newAuthToken();
    let tokenEnc: string;
    try { tokenEnc = encryptToken(token); }
    catch (err) {
      if (err instanceof TokenKeyError) return reply.status(503).send({ error: { code: "NOT_CONFIGURED", message: "Public API encryption key is not configured" } });
      throw err;
    }
    const row = await fastify.prisma.apiKey.create({
      data: {
        organizationId, name: name.trim(), keyHash: hashToken(token), tokenEnc, scopes: ["whatsapp"],
        createdBy: userId, callbackUrl: callbackUrl || null, inboundUrl: inboundUrl || null,
      },
      select: { id: true, name: true, createdAt: true },
    });
    writeAdminAudit({ prisma: fastify.prisma, actorId: userId, action: "api_credential.create", targetType: "api_credential", targetId: row.id, metadata: { organizationId }, request });
    return reply.status(201).send({ data: { authId: row.id, authToken: token, name: row.name, createdAt: row.createdAt } });
  });

  fastify.patch<{ Params: { id: string }; Body: CredentialBody }>("/api-credentials/:id", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const existing = await fastify.prisma.apiKey.findFirst({ where: { id: request.params.id, organizationId, revokedAt: null } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Credential not found" } });
    const { name, callbackUrl, inboundUrl } = request.body ?? {};
    if (!(await validUrl(reply, callbackUrl, "callbackUrl"))) return reply;
    if (!(await validUrl(reply, inboundUrl, "inboundUrl"))) return reply;
    const data = await fastify.prisma.apiKey.update({
      where: { id: existing.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(callbackUrl !== undefined && { callbackUrl: callbackUrl || null }),
        ...(inboundUrl !== undefined && { inboundUrl: inboundUrl || null }),
      },
      select: LIST_SELECT,
    });
    writeAdminAudit({ prisma: fastify.prisma, actorId: userId, action: "api_credential.update", targetType: "api_credential", targetId: existing.id, metadata: { organizationId }, request });
    return reply.send({ data });
  });

  fastify.post<{ Params: { id: string } }>("/api-credentials/:id/rotate", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const existing = await fastify.prisma.apiKey.findFirst({ where: { id: request.params.id, organizationId, revokedAt: null } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Credential not found" } });
    const token = newAuthToken();
    let tokenEnc: string;
    try { tokenEnc = encryptToken(token); }
    catch (err) {
      if (err instanceof TokenKeyError) return reply.status(503).send({ error: { code: "NOT_CONFIGURED", message: "Public API encryption key is not configured" } });
      throw err;
    }
    await fastify.prisma.apiKey.update({ where: { id: existing.id }, data: { keyHash: hashToken(token), tokenEnc } });
    writeAdminAudit({ prisma: fastify.prisma, actorId: userId, action: "api_credential.rotate", targetType: "api_credential", targetId: existing.id, metadata: { organizationId }, request });
    return reply.send({ data: { authId: existing.id, authToken: token } });
  });

  fastify.delete<{ Params: { id: string } }>("/api-credentials/:id", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const existing = await fastify.prisma.apiKey.findFirst({ where: { id: request.params.id, organizationId, revokedAt: null } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Credential not found" } });
    await fastify.prisma.apiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    writeAdminAudit({ prisma: fastify.prisma, actorId: userId, action: "api_credential.revoke", targetType: "api_credential", targetId: existing.id, metadata: { organizationId }, request });
    return reply.status(204).send();
  });
};
```
Note: `writeAdminAudit` writes to `admin_audit_logs` (platform admin audit table, no FK on `actor_id`). Tenant credential events will therefore appear there; this matches the PRD ("written to the audit log"). Never put token values in `metadata`.

- [ ] **Step 4: Run to verify it passes**, `npx vitest run src/routes/api-credentials.test.ts`.

- [ ] **Step 5: Classify the family in the impersonation guard and register the router**

In `lib/impersonation-guard.ts` add to `BLOCKED_PREFIXES` (after `"/v1/webhook-endpoints", ...`):
```ts
  "/v1/api-credentials", // public API credentials / auth tokens
```
In `routes/index.ts` add `import { apiCredentialsRouter } from "./api-credentials.js";` and, after the `webhookEndpointsRouter` registration:
```ts
  await fastify.register(apiCredentialsRouter, { prefix: "/v1" });
```
Also add `"/v1/api-credentials"` to `SECRET_READ_PREFIXES`? No: GET never returns secrets (list select excludes them), so GET stays read-like. Add a classification test line in `impersonation-guard.test.ts` next to the `rotate-secret` assertion:
```ts
    expect(classifyRoute("POST", "/v1/api-credentials/:id/rotate")).toBe("blocked");
    expect(classifyRoute("POST", "/v1/api-credentials")).toBe("blocked");
```

- [ ] **Step 6: Run guard test and the new tests**

Run: `npx vitest run src/lib/impersonation-guard.test.ts src/routes/api-credentials.test.ts`
Expected: PASS (the route-classification test must stay green).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/api-credentials.ts apps/api/src/routes/api-credentials.test.ts apps/api/src/lib/impersonation-guard.ts apps/api/src/lib/impersonation-guard.test.ts apps/api/src/routes/index.ts
git commit -m "feat(public-api): credential management routes (create/list/update/rotate/revoke)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Send body validation and Meta payload mapping

**Files:**
- Create: `apps/api/src/lib/public-api/send-mapping.ts`
- Test: `apps/api/src/lib/public-api/send-mapping.test.ts`

**Interfaces:**
- Consumes: `normalizeFullPhone` (`lib/phone-normalize.ts:16`), types `WaInteractivePayload`, `WaTemplateComponent` (Task 4).
- Produces:
  - `MAX_DST = 20`, `MAX_TEXT = 4096`
  - `class SendValidationError extends Error`
  - `parseSendBody(body: unknown): ParsedSend` where
    `ParsedSend = { src: string; dsts: string[]; callbackUrl: string | null; callbackMethod: "GET" | "POST"; content: SendContent }` and
    `SendContent = { kind: "text"; text: string } | { kind: "media"; mediaUrl: string; caption: string | null } | { kind: "template"; name: string; language: string; components: PlivoTemplateComponent[] } | { kind: "location"; latitude: string; longitude: string; name: string; address: string } | { kind: "interactive"; interactive: PlivoInteractive }`
  - `inferMediaKind(url: string): "image" | "video" | "document" | "audio"`
  - `toMetaTemplateComponents(components: PlivoTemplateComponent[], headerFormat: string | null): WaTemplateComponent[]`
  - `toMetaInteractive(i: PlivoInteractive): WaInteractivePayload` **[PROVISIONAL for list shape]**
  - `renderTemplateForInbox(name: string, stored: unknown[], components: PlivoTemplateComponent[]): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseSendBody, SendValidationError, inferMediaKind, toMetaTemplateComponents, toMetaInteractive, renderTemplateForInbox } from "./send-mapping.js";

const base = { src: "+14151112221", dst: "+14151112222", type: "whatsapp" };
const bad = (b: unknown) => expect(() => parseSendBody(b)).toThrow(SendValidationError);

describe("parseSendBody", () => {
  it("parses a text message", () => {
    const p = parseSendBody({ ...base, text: "hello", url: "https://c.example.com/cb", method: "get" });
    expect(p.src).toBe("14151112221");
    expect(p.dsts).toEqual(["14151112222"]);
    expect(p.callbackUrl).toBe("https://c.example.com/cb");
    expect(p.callbackMethod).toBe("GET");
    expect(p.content).toEqual({ kind: "text", text: "hello" });
  });

  it("splits dst on '<', normalizes and de-duplicates", () => {
    const p = parseSendBody({ ...base, dst: "+14151112222<14151112222< +14155550000", text: "x" });
    expect(p.dsts).toEqual(["14151112222", "14155550000"]);
  });

  it("rejects the whole request for any invalid, empty or too many recipients", () => {
    bad({ ...base, dst: "+14151112222<abc", text: "x" });
    bad({ ...base, dst: "+14151112222<<+14155550000", text: "x" });
    bad({ ...base, dst: "", text: "x" });
    const many = Array.from({ length: 21 }, (_, i) => `+1415555${String(1000 + i)}`).join("<");
    bad({ ...base, dst: many, text: "x" });
  });

  it("requires type=whatsapp and src", () => {
    bad({ ...base, type: "sms", text: "x" });
    bad({ dst: base.dst, type: "whatsapp", text: "x" });
    bad({ ...base, src: "nope", text: "x" });
  });

  it("requires exactly one content kind and enforces text length", () => {
    bad({ ...base });
    bad({ ...base, text: "x", template: { name: "t", language: "en" } });
    bad({ ...base, text: "x".repeat(4097) });
    bad({ ...base, text: "   " });
  });

  it("parses media (text becomes caption), location, template and interactive", () => {
    expect(parseSendBody({ ...base, text: "cap", media_urls: ["https://m.example.com/a.png"] }).content)
      .toEqual({ kind: "media", mediaUrl: "https://m.example.com/a.png", caption: "cap" });
    expect(parseSendBody({ ...base, media_urls: "https://m.example.com/a.pdf" }).content)
      .toEqual({ kind: "media", mediaUrl: "https://m.example.com/a.pdf", caption: null });
    expect(parseSendBody({ ...base, location: { latitude: "1", longitude: "2", name: "n", address: "a" } }).content)
      .toEqual({ kind: "location", latitude: "1", longitude: "2", name: "n", address: "a" });
    bad({ ...base, location: { latitude: "1", longitude: "2", name: "n" } });
    expect(parseSendBody({ ...base, template: { name: "t", language: "en_US" } }).content)
      .toEqual({ kind: "template", name: "t", language: "en_US", components: [] });
    bad({ ...base, media_urls: ["http://insecure.example.com/a.png"] });
    bad({ ...base, media_urls: ["https://a/1.png", "https://a/2.png"] });
  });
});

describe("inferMediaKind", () => {
  it.each([["https://x/a.JPG", "image"], ["https://x/a.mp4?s=1", "video"], ["https://x/a.pdf", "document"], ["https://x/a.mp3", "audio"], ["https://x/a", "image"]])
    ("%s -> %s", (u, k) => { expect(inferMediaKind(u)).toBe(k); });
});

describe("toMetaTemplateComponents", () => {
  it("maps media/text/payload parameters using the stored header format", () => {
    const out = toMetaTemplateComponents([
      { type: "header", parameters: [{ type: "media", media: "https://x/a.mp4" }] },
      { type: "body", parameters: [{ type: "text", text: "John" }] },
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "p1" }] },
      { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: "abc" }] },
    ], "VIDEO");
    expect(out).toEqual([
      { type: "header", parameters: [{ type: "video", video: { link: "https://x/a.mp4" } }] },
      { type: "body", parameters: [{ type: "text", text: "John" }] },
      { type: "button", sub_type: "quick_reply", index: 0, parameters: [{ type: "payload", payload: "p1" }] },
      { type: "button", sub_type: "url", index: 1, parameters: [{ type: "text", text: "abc" }] },
    ]);
  });
  it("rejects unknown component types", () => {
    expect(() => toMetaTemplateComponents([{ type: "weird" }], null)).toThrow(SendValidationError);
  });
});

describe("toMetaInteractive", () => {
  it("maps reply buttons", () => {
    expect(toMetaInteractive({ type: "button", header: { type: "media", media: "https://x/a.png" }, body: { text: "Pick" }, action: { buttons: [{ title: "A", id: "1" }] } })).toEqual({
      type: "button", header: { type: "image", image: { link: "https://x/a.png" } }, body: { text: "Pick" },
      action: { buttons: [{ type: "reply", reply: { id: "1", title: "A" } }] },
    });
  });
  it("maps cta_url", () => {
    expect(toMetaInteractive({ type: "cta_url", body: { text: "Go" }, footer: { text: "f" }, action: { buttons: [{ title: "Open", cta_url: "https://plivo.com" }] } })).toEqual({
      type: "cta_url", body: { text: "Go" }, footer: { text: "f" },
      action: { name: "cta_url", parameters: { display_text: "Open", url: "https://plivo.com" } },
    });
  });
  it("maps the documented list shape (action.lists) into one section", () => {
    const out = toMetaInteractive({ type: "list", body: { text: "Choose" }, action: { lists: [{ title: "A", id: "1" }] } });
    expect(out.action).toEqual({ button: "Options", sections: [{ title: "Options", rows: [{ id: "1", title: "A" }] }] });
  });
  it("rejects unknown types", () => {
    expect(() => toMetaInteractive({ type: "x", body: { text: "t" }, action: {} })).toThrow(SendValidationError);
  });
});

describe("renderTemplateForInbox", () => {
  it("fills body variables from parameters", () => {
    const json = JSON.parse(renderTemplateForInbox("welcome", [{ type: "BODY", text: "Hi {{1}}, order {{2}}" }, { type: "FOOTER", text: "bye" }], [
      { type: "body", parameters: [{ type: "text", text: "Ann" }, { type: "text", text: "42" }] },
    ])) as { templateName: string; body: string; footer: string };
    expect(json).toMatchObject({ templateName: "welcome", body: "Hi Ann, order 42", footer: "bye" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**, `npx vitest run src/lib/public-api/send-mapping.test.ts`.

- [ ] **Step 3: Implement `send-mapping.ts`**

```ts
import { normalizeFullPhone } from "../phone-normalize.js";
import type { WaInteractivePayload, WaTemplateComponent } from "../whatsapp.js";

export const MAX_DST = 20;
export const MAX_TEXT = 4096;

export class SendValidationError extends Error {}

export interface PlivoTemplateComponent {
  type: string;
  sub_type?: string;
  index?: string | number;
  parameters?: Array<{ type: string; text?: string; media?: string; payload?: string }>;
}

export interface PlivoInteractive {
  type: string;
  header?: { type: string; media?: string };
  body: { text: string };
  footer?: { text: string };
  action: {
    buttons?: Array<{ title: string; id?: string; cta_url?: string }>;
    lists?: Array<{ title: string; id: string }>;
    button?: string;
    sections?: unknown[];
  };
}

export type SendContent =
  | { kind: "text"; text: string }
  | { kind: "media"; mediaUrl: string; caption: string | null }
  | { kind: "template"; name: string; language: string; components: PlivoTemplateComponent[] }
  | { kind: "location"; latitude: string; longitude: string; name: string; address: string }
  | { kind: "interactive"; interactive: PlivoInteractive };

export interface ParsedSend {
  src: string;
  dsts: string[];
  callbackUrl: string | null;
  callbackMethod: "GET" | "POST";
  content: SendContent;
}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function inferMediaKind(url: string): "image" | "video" | "document" | "audio" {
  const ext = (/\.([a-z0-9]+)(?:$|[?#])/i.exec(url)?.[1] ?? "").toLowerCase();
  if (["mp4", "3gp", "mov"].includes(ext)) return "video";
  if (["mp3", "ogg", "aac", "amr", "m4a"].includes(ext)) return "audio";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"].includes(ext)) return "document";
  return "image";
}

export function parseSendBody(body: unknown): ParsedSend {
  if (!isObj(body)) throw new SendValidationError("Request body must be a JSON object");
  if (body["type"] !== "whatsapp") throw new SendValidationError("Only type=whatsapp is supported");

  const src = normalizeFullPhone(str(body["src"]) ?? "");
  if (!src) throw new SendValidationError("src must be a valid WhatsApp Business number");

  const rawDst = str(body["dst"]);
  if (!rawDst) throw new SendValidationError("dst is required");
  const dsts: string[] = [];
  for (const part of rawDst.split("<")) {
    const n = normalizeFullPhone(part.trim());
    if (!n) throw new SendValidationError(`Invalid destination number: ${part.trim() || "(empty)"}`);
    if (!dsts.includes(n)) dsts.push(n);
  }
  if (dsts.length > MAX_DST) throw new SendValidationError(`At most ${MAX_DST} destinations per request`);

  const callbackUrl = str(body["url"]);
  const callbackMethod = String(body["method"] ?? "POST").toUpperCase() === "GET" ? "GET" : "POST";

  const text = typeof body["text"] === "string" ? body["text"] : null;
  const mediaRaw = body["media_urls"];
  const media = Array.isArray(mediaRaw) ? mediaRaw : mediaRaw != null ? [mediaRaw] : [];
  const kinds = [body["template"] != null, body["interactive"] != null, body["location"] != null, media.length > 0];
  if (kinds.filter(Boolean).length > 1 || (kinds.some(Boolean) && text !== null && media.length === 0)) {
    throw new SendValidationError("Send exactly one of text, media_urls, template, interactive or location");
  }
  if (text !== null && text.length > MAX_TEXT) throw new SendValidationError(`text must be at most ${MAX_TEXT} characters`);

  let content: SendContent;
  if (isObj(body["template"])) {
    const t = body["template"];
    const name = str(t["name"]); const language = str(t["language"]);
    if (!name || !language) throw new SendValidationError("template.name and template.language are required");
    content = { kind: "template", name, language, components: Array.isArray(t["components"]) ? (t["components"] as PlivoTemplateComponent[]) : [] };
  } else if (isObj(body["interactive"])) {
    content = { kind: "interactive", interactive: body["interactive"] as unknown as PlivoInteractive };
  } else if (isObj(body["location"])) {
    const l = body["location"];
    const [latitude, longitude, name, address] = ["latitude", "longitude", "name", "address"].map((k) => (l[k] == null ? null : String(l[k]))) as Array<string | null>;
    if (!latitude || !longitude || !name || !address || Number.isNaN(Number(latitude)) || Number.isNaN(Number(longitude))) {
      throw new SendValidationError("location requires numeric latitude and longitude plus name and address");
    }
    content = { kind: "location", latitude, longitude, name, address };
  } else if (media.length > 0) {
    if (media.length > 1) throw new SendValidationError("WhatsApp messages accept a single media URL");
    const url = str(media[0]);
    if (!url || !url.startsWith("https://")) throw new SendValidationError("media_urls must be an https URL");
    content = { kind: "media", mediaUrl: url, caption: text?.trim() ? text.trim() : null };
  } else {
    if (!text?.trim()) throw new SendValidationError("text is required");
    content = { kind: "text", text: text.trim() };
  }
  return { src, dsts, callbackUrl, callbackMethod, content };
}

type MetaParam = NonNullable<WaTemplateComponent["parameters"]>[number];

export function toMetaTemplateComponents(components: PlivoTemplateComponent[], headerFormat: string | null): WaTemplateComponent[] {
  return components.map((c) => {
    const type = c.type?.toLowerCase();
    if (type !== "header" && type !== "body" && type !== "button") {
      throw new SendValidationError(`Unsupported template component type: ${c.type}`);
    }
    const parameters = (c.parameters ?? []).map((p): MetaParam => {
      if (p.type === "media") {
        const f = (headerFormat ?? "IMAGE").toLowerCase();
        const kind = f === "video" || f === "document" ? f : "image";
        return { type: kind, [kind]: { link: p.media ?? "" } } as MetaParam;
      }
      if (p.type === "payload") return { type: "payload", payload: p.payload ?? "" };
      return { type: "text", text: p.text ?? "" };
    });
    return {
      type,
      ...(c.sub_type ? { sub_type: c.sub_type } : {}),
      ...(c.index !== undefined ? { index: Number(c.index) } : {}),
      parameters,
    };
  });
}

/** PROVISIONAL: shapes follow Plivo's docs examples; confirm against the client's real interactive requests. */
export function toMetaInteractive(i: PlivoInteractive): WaInteractivePayload {
  const header = i.header?.type === "media" && i.header.media
    ? ({ type: inferMediaKind(i.header.media), [inferMediaKind(i.header.media)]: { link: i.header.media } } as WaInteractivePayload["header"])
    : undefined;
  const common = { ...(header ? { header } : {}), body: { text: i.body.text }, ...(i.footer ? { footer: { text: i.footer.text } } : {}) };
  if (i.type === "button") {
    return { type: "button", ...common, action: { buttons: (i.action.buttons ?? []).map((b) => ({ type: "reply", reply: { id: b.id ?? b.title, title: b.title } })) } };
  }
  if (i.type === "cta_url") {
    const b = i.action.buttons?.[0];
    if (!b?.cta_url) throw new SendValidationError("cta_url requires action.buttons[0].cta_url");
    return { type: "cta_url", ...common, action: { name: "cta_url", parameters: { display_text: b.title, url: b.cta_url } } };
  }
  if (i.type === "list") {
    if (i.action.sections) return { type: "list", ...common, action: { button: i.action.button ?? "Options", sections: i.action.sections } };
    const rows = (i.action.lists ?? []).map((r) => ({ id: r.id, title: r.title }));
    return { type: "list", ...common, action: { button: i.action.button ?? "Options", sections: [{ title: "Options", rows }] } };
  }
  throw new SendValidationError(`Unsupported interactive type: ${i.type}`);
}

type StoredComp = { type?: string; format?: string; text?: string; buttons?: unknown[] };

/** Same JSON shape the inbox already renders for template messages (see routes/messages.ts renderedBody). */
export function renderTemplateForInbox(name: string, stored: unknown[], components: PlivoTemplateComponent[]): string {
  const comps = stored as StoredComp[];
  const find = (t: string) => comps.find((c) => c.type?.toUpperCase() === t);
  let body = find("BODY")?.text ?? "";
  const bodyParams = components.find((c) => c.type?.toLowerCase() === "body")?.parameters ?? [];
  bodyParams.forEach((p, idx) => { body = body.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, "g"), p.text ?? ""); });
  const header = find("HEADER");
  return JSON.stringify({
    templateName: name,
    header: header ? { format: header.format ?? "TEXT", text: header.text ?? null, mediaUrl: null } : null,
    body: body || name,
    footer: find("FOOTER")?.text ?? null,
    buttons: find("BUTTONS")?.buttons ?? [],
    carousel: null,
  });
}
```

- [ ] **Step 4: Run to verify it passes**, `npx vitest run src/lib/public-api/send-mapping.test.ts`; then `npx tsc --noEmit`. Fix type errors in the mapper casts if any (keep behavior identical).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/public-api/send-mapping.ts apps/api/src/lib/public-api/send-mapping.test.ts
git commit -m "feat(public-api): validate Plivo send bodies and map to Meta payloads" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Queues, callback enqueue/ratchet, and `POST /Message/`

**Files:**
- Create: `apps/api/src/lib/public-api/queues.ts`, `apps/api/src/lib/public-api/callbacks.ts`, `apps/api/src/routes/public-api/messages.ts`
- Test: `apps/api/src/lib/public-api/callbacks.test.ts`, `apps/api/src/routes/public-api/messages.test.ts`

**Interfaces:**
- Consumes: Tasks 2-7.
- Produces:
  - `publicApiSendQueue: Queue<SendJob>`, `publicApiCallbackQueue: Queue<CallbackJob>`; `interface SendJob { messageId: string; organizationId: string; to: string; content: SendContentForWorker }` where `SendContentForWorker` = `{ kind: "text"; text: string } | { kind: "media"; mediaUrl: string; caption: string | null } | { kind: "template"; name: string; language: string; components: WaTemplateComponent[] } | { kind: "location"; latitude: string; longitude: string; name: string; address: string } | { kind: "interactive"; interactive: WaInteractivePayload }`; `interface CallbackJob { apiKeyId: string; organizationId: string; url: string; method: "GET" | "POST"; fields: Record<string, string> }`.
  - `type PlivoStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "undelivered"`
  - `enqueueStatusCallback(prisma: PrismaClient, messageId: string, next: PlivoStatus, extra?: { errorCode?: string | null; conversation?: { id?: string; origin?: string; expiration?: number } }): Promise<void>`
  - `buildStatusFields(args): Record<string, string>` (pure)
  - `publicApiMessagesRouter` (POST here; GETs added in Task 11)

- [ ] **Step 1: Create `queues.ts`**

```ts
import { Queue } from "bullmq";
import { redisConnection } from "../queue.js";
import type { WaInteractivePayload, WaTemplateComponent } from "../whatsapp.js";

export type SendContentForWorker =
  | { kind: "text"; text: string }
  | { kind: "media"; mediaUrl: string; caption: string | null }
  | { kind: "template"; name: string; language: string; components: WaTemplateComponent[] }
  | { kind: "location"; latitude: string; longitude: string; name: string; address: string }
  | { kind: "interactive"; interactive: WaInteractivePayload };

export interface SendJob { messageId: string; organizationId: string; to: string; content: SendContentForWorker }

export interface CallbackJob {
  apiKeyId: string;
  organizationId: string;
  url: string;
  method: "GET" | "POST";
  fields: Record<string, string>;
}

// attempts:1 for sends: a retry could deliver the same WhatsApp message twice.
export const publicApiSendQueue = new Queue<SendJob>("public-api-send", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 1, removeOnComplete: { age: 3600 }, removeOnFail: { age: 604800 } },
});

// 1 try + 3 retries; the worker's custom backoff yields 60 s, 120 s, 240 s.
export const publicApiCallbackQueue = new Queue<CallbackJob>("public-api-callbacks", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 4, backoff: { type: "custom" }, removeOnComplete: { age: 86400 }, removeOnFail: { age: 604800 } },
});
```

- [ ] **Step 2: Write the failing callbacks test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const add = vi.fn();
vi.mock("./queues.js", () => ({ publicApiCallbackQueue: { add: (...a: unknown[]) => add(...a) }, publicApiSendQueue: { add: vi.fn() } }));
import { enqueueStatusCallback, buildStatusFields } from "./callbacks.js";

const prisma = {
  apiMessageMeta: { findUnique: vi.fn(), updateMany: vi.fn() },
  apiKey: { findUnique: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
};
const P = prisma as unknown as PrismaClient;

const meta = (over: Record<string, unknown> = {}) => ({
  messageId: "m1", apiKeyId: "k1", organizationId: "org-1", dst: "14151112222", callbackUrl: null, callbackMethod: "POST",
  errorCode: null, lastStatus: null, sequence: 0, queuedAt: new Date("2026-10-05T10:00:00.123Z"), sentAt: null, deliveryReportAt: null, ...over,
});

describe("enqueueStatusCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.apiKey.findUnique.mockResolvedValue({ callbackUrl: "https://c.example.com/cb" });
    prisma.vendorSetting.findFirst.mockResolvedValue({ value: "+1 415-111-2221" });
    prisma.apiMessageMeta.updateMany.mockResolvedValue({ count: 1 });
  });

  it("enqueues a queued callback with sequence 1 and form fields", async () => {
    prisma.apiMessageMeta.findUnique.mockResolvedValue(meta());
    await enqueueStatusCallback(P, "m1", "queued");
    expect(prisma.apiMessageMeta.updateMany.mock.calls[0]![0]).toMatchObject({ where: { messageId: "m1", lastStatus: null }, data: { lastStatus: "queued", sequence: { increment: 1 } } });
    const [name, data] = add.mock.calls[0]!;
    expect(name).toBe("status");
    expect(data).toMatchObject({ apiKeyId: "k1", organizationId: "org-1", url: "https://c.example.com/cb", method: "POST" });
    expect(data.fields).toMatchObject({ MessageUUID: "m1", To: "14151112222", From: "14151112221", Type: "whatsapp", Status: "queued", Sequence: "1" });
    expect(data.fields["ErrorCode"]).toBeUndefined();
  });

  it("per-message URL overrides the credential default", async () => {
    prisma.apiMessageMeta.findUnique.mockResolvedValue(meta({ callbackUrl: "https://msg.example.com/x", callbackMethod: "GET" }));
    await enqueueStatusCallback(P, "m1", "queued");
    expect(add.mock.calls[0]![1]).toMatchObject({ url: "https://msg.example.com/x", method: "GET" });
  });

  it("only moves forward: read after delivered ok, delivered after read dropped, duplicate dropped", async () => {
    prisma.apiMessageMeta.findUnique.mockResolvedValue(meta({ lastStatus: "delivered", sequence: 2 }));
    await enqueueStatusCallback(P, "m1", "read");
    expect(add).toHaveBeenCalledTimes(1);
    prisma.apiMessageMeta.findUnique.mockResolvedValue(meta({ lastStatus: "read", sequence: 3 }));
    await enqueueStatusCallback(P, "m1", "delivered");
    await enqueueStatusCallback(P, "m1", "read");
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("failed/undelivered only before delivered; never after read/delivered/failed", async () => {
    prisma.apiMessageMeta.findUnique.mockResolvedValue(meta({ lastStatus: "sent" }));
    await enqueueStatusCallback(P, "m1", "undelivered", { errorCode: "380" });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]![1].fields).toMatchObject({ Status: "undelivered", ErrorCode: "380" });
    for (const last of ["delivered", "read", "failed", "undelivered"]) {
      prisma.apiMessageMeta.findUnique.mockResolvedValue(meta({ lastStatus: last }));
      await enqueueStatusCallback(P, "m1", "failed");
    }
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("does not enqueue when a concurrent writer won the ratchet (updateMany count 0)", async () => {
    prisma.apiMessageMeta.findUnique.mockResolvedValue(meta());
    prisma.apiMessageMeta.updateMany.mockResolvedValue({ count: 0 });
    await enqueueStatusCallback(P, "m1", "queued");
    expect(add).not.toHaveBeenCalled();
  });

  it("updates state but enqueues nothing when no callback URL is configured", async () => {
    prisma.apiMessageMeta.findUnique.mockResolvedValue(meta());
    prisma.apiKey.findUnique.mockResolvedValue({ callbackUrl: null });
    await enqueueStatusCallback(P, "m1", "queued");
    expect(prisma.apiMessageMeta.updateMany).toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it("does nothing for a message without api metadata", async () => {
    prisma.apiMessageMeta.findUnique.mockResolvedValue(null);
    await enqueueStatusCallback(P, "ghost", "queued");
    expect(add).not.toHaveBeenCalled();
  });
});

describe("buildStatusFields", () => {
  it("formats times as 'YYYY-MM-DD HH:MM:SS.ffffff' and includes WhatsApp conversation fields when provided", () => {
    const f = buildStatusFields({
      messageId: "m1", from: "14151112221", to: "14151112222", status: "delivered", sequence: 3, errorCode: null,
      queuedAt: new Date("2026-10-05T10:00:00.123Z"), sentAt: new Date("2026-10-05T10:00:01.000Z"), deliveryReportAt: new Date("2026-10-05T10:00:05.500Z"),
      conversation: { id: "c1", origin: "service", expiration: 1790000000 },
    });
    expect(f).toMatchObject({
      MessageUUID: "m1", Status: "delivered", Sequence: "3", Units: "1", TotalRate: "0", TotalAmount: "0", MCC: "", MNC: "",
      MessageTime: "2026-10-05 10:00:00.123000", QueuedTime: "2026-10-05 10:00:00.123000", SentTime: "2026-10-05 10:00:01.000000",
      DeliveryReportTime: "2026-10-05 10:00:05.500000", ConversationID: "c1", ConversationOrigin: "service", ConversationExpirationTimestamp: "1790000000",
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**, `npx vitest run src/lib/public-api/callbacks.test.ts`.

- [ ] **Step 4: Implement `callbacks.ts`**

```ts
import type { PrismaClient } from "@prisma/client";
import { publicApiCallbackQueue } from "./queues.js";

export type PlivoStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "undelivered";

const RANK: Record<PlivoStatus, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4, undelivered: 4 };

function canAdvance(last: string | null, next: PlivoStatus): boolean {
  if (last === null) return true;
  const lastRank = RANK[last as PlivoStatus];
  if (lastRank === undefined) return false;
  if (next === "failed" || next === "undelivered") return lastRank < RANK.delivered;
  return lastRank < 4 && RANK[next] > lastRank;
}

function plivoTime(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace("T", " ")}.${String(d.getUTCMilliseconds()).padStart(3, "0")}000`;
}

export interface StatusFieldArgs {
  messageId: string; from: string; to: string; status: PlivoStatus; sequence: number; errorCode: string | null;
  queuedAt: Date; sentAt: Date | null; deliveryReportAt: Date | null;
  conversation?: { id?: string; origin?: string; expiration?: number };
}

/**
 * Plivo status-callback fields. Units/TotalRate/TotalAmount/MCC/MNC have no Meta source (Q4): static placeholders.
 * ConversationID/Origin/ExpirationTimestamp are only sent when Meta's status webhook supplied them.
 */
export function buildStatusFields(a: StatusFieldArgs): Record<string, string> {
  return {
    MessageUUID: a.messageId, To: a.to, From: a.from, Type: "whatsapp", Status: a.status,
    Units: "1", TotalRate: "0", TotalAmount: "0", MCC: "", MNC: "",
    ...((a.status === "failed" || a.status === "undelivered") && a.errorCode ? { ErrorCode: a.errorCode } : {}),
    Sequence: String(a.sequence),
    MessageTime: plivoTime(a.queuedAt), QueuedTime: plivoTime(a.queuedAt),
    ...(a.sentAt ? { SentTime: plivoTime(a.sentAt) } : {}),
    ...(a.deliveryReportAt ? { DeliveryReportTime: plivoTime(a.deliveryReportAt) } : {}),
    ...(a.conversation?.id ? { ConversationID: a.conversation.id } : {}),
    ...(a.conversation?.origin ? { ConversationOrigin: a.conversation.origin } : {}),
    ...(a.conversation?.expiration ? { ConversationExpirationTimestamp: String(a.conversation.expiration) } : {}),
  };
}

export async function businessNumberDigits(prisma: PrismaClient, organizationId: string): Promise<string> {
  const row = await prisma.vendorSetting.findFirst({ where: { organizationId, key: "current_phone_number_number" }, select: { value: true } });
  return (row?.value ?? "").replace(/\D/g, "");
}

/** Ratchet the message's API-visible status and queue the callback. Safe to call repeatedly and concurrently. */
export async function enqueueStatusCallback(
  prisma: PrismaClient,
  messageId: string,
  next: PlivoStatus,
  extra: { errorCode?: string | null; conversation?: { id?: string; origin?: string; expiration?: number } } = {}
): Promise<void> {
  const meta = await prisma.apiMessageMeta.findUnique({ where: { messageId } });
  if (!meta || !canAdvance(meta.lastStatus, next)) return;

  const now = new Date();
  const terminal = next === "delivered" || next === "read" || next === "failed" || next === "undelivered";
  const won = await prisma.apiMessageMeta.updateMany({
    where: { messageId, lastStatus: meta.lastStatus },
    data: {
      lastStatus: next,
      sequence: { increment: 1 },
      ...(extra.errorCode ? { errorCode: extra.errorCode } : {}),
      ...(next === "sent" ? { sentAt: now } : {}),
      ...(terminal ? { deliveryReportAt: now } : {}),
    },
  });
  if (won.count === 0) return;

  const key = await prisma.apiKey.findUnique({ where: { id: meta.apiKeyId }, select: { callbackUrl: true } });
  const url = meta.callbackUrl ?? key?.callbackUrl ?? null;
  if (!url) return;

  const from = await businessNumberDigits(prisma, meta.organizationId);
  const fields = buildStatusFields({
    messageId, from, to: meta.dst, status: next, sequence: meta.sequence + 1,
    errorCode: extra.errorCode ?? meta.errorCode,
    queuedAt: meta.queuedAt, sentAt: next === "sent" ? now : meta.sentAt, deliveryReportAt: terminal ? now : meta.deliveryReportAt,
    ...(extra.conversation ? { conversation: extra.conversation } : {}),
  });
  await publicApiCallbackQueue.add("status", {
    apiKeyId: meta.apiKeyId, organizationId: meta.organizationId, url,
    method: meta.callbackMethod === "GET" ? "GET" : "POST", fields,
  });
}
```

- [ ] **Step 5: Run to verify it passes**, `npx vitest run src/lib/public-api/callbacks.test.ts`.

- [ ] **Step 6: Write the failing `POST /Message/` route test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const sendAdd = vi.fn();
const enqueueCb = vi.fn();
vi.mock("../../lib/public-api/queues.js", () => ({ publicApiSendQueue: { add: (...a: unknown[]) => sendAdd(...a) }, publicApiCallbackQueue: { add: vi.fn() } }));
vi.mock("../../lib/public-api/callbacks.js", () => ({ enqueueStatusCallback: (...a: unknown[]) => enqueueCb(...a), businessNumberDigits: vi.fn() }));
vi.mock("../../lib/public-api/safe-url.js", async (orig) => {
  const real = await orig<typeof import("../../lib/public-api/safe-url.js")>();
  return { ...real, assertSafeCallbackUrl: vi.fn(async (u: string) => { if (u.includes("bad")) throw new real.UnsafeUrlError("unsafe"); return new URL(u); }) };
});

const mockPrisma = {
  organization: { findUnique: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
  apiKey: { findUnique: vi.fn() },
  template: { findMany: vi.fn() },
  contact: { upsert: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn() },
  message: { create: vi.fn() },
  apiMessageMeta: { create: vi.fn() },
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.publicApi = { apiKeyId: "k1", organizationId: "org-1" }; });
  const { publicApiMessagesRouter } = await import("./messages.js");
  await app.register(publicApiMessagesRouter, { prefix: "/v1/Account/:authId" });
  return app;
}

const body = { src: "+14151112221", dst: "+14151112222", type: "whatsapp", text: "hello" };
const post = (app: FastifyInstance, payload: unknown, url = "/v1/Account/k1/Message/") => app.inject({ method: "POST", url, payload: payload as object });

describe("POST /Message/", () => {
  let app: FastifyInstance;
  let n = 0;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks(); n = 0;
    mockPrisma.organization.findUnique.mockResolvedValue({ phoneNumberId: "pn-1", wabaAccessToken: "tok" });
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "+1 415-111-2221" });
    mockPrisma.apiKey.findUnique.mockResolvedValue({ callbackUrl: null });
    mockPrisma.contact.upsert.mockResolvedValue({ id: "c1" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    mockPrisma.message.create.mockImplementation(async () => ({ id: `msg-${++n}` }));
    mockPrisma.apiMessageMeta.create.mockResolvedValue({});
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("accepts a text send: 202, one uuid per destination, org-scoped rows, job queued, queued callback", async () => {
    const res = await post(app, { ...body, dst: "+14151112222<+14155550000" });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ message: "message(s) queued", message_uuid: ["msg-1", "msg-2"], api_id: expect.any(String) });
    expect(mockPrisma.message.create.mock.calls[0]![0].data).toMatchObject({ organizationId: "org-1", direction: "outbound", contentType: "text", body: "hello", status: "sending" });
    expect(mockPrisma.contact.upsert.mock.calls[0]![0].where).toEqual({ organizationId_phoneNumber: { organizationId: "org-1", phoneNumber: "14151112222" } });
    expect(mockPrisma.apiMessageMeta.create.mock.calls[0]![0].data).toMatchObject({ messageId: "msg-1", apiKeyId: "k1", organizationId: "org-1", dst: "14151112222" });
    expect(sendAdd).toHaveBeenCalledTimes(2);
    expect(sendAdd.mock.calls[0]![1]).toMatchObject({ messageId: "msg-1", organizationId: "org-1", to: "14151112222", content: { kind: "text", text: "hello" } });
    expect(JSON.stringify(sendAdd.mock.calls)).not.toContain("tok"); // Meta token never goes into Redis
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "msg-1", "queued");
  });

  it("works without the trailing slash too", async () => {
    expect((await post(app, body, "/v1/Account/k1/Message")).statusCode).toBe(202);
  });

  it("creates the conversation silently (no assignment) for a brand-new number", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-new" });
    await post(app, body);
    expect(mockPrisma.conversation.create.mock.calls[0]![0].data).toMatchObject({ organizationId: "org-1", whatsappContactId: "14151112222", channelType: "whatsapp", status: "open" });
    expect(mockPrisma.conversation.create.mock.calls[0]![0].data.assignedTo).toBeUndefined();
  });

  it("400 for validation errors with the Plivo error body, and nothing is written", async () => {
    const res = await post(app, { ...body, dst: "+14151112222<abc" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: expect.any(String), api_id: expect.any(String) });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(sendAdd).not.toHaveBeenCalled();
  });

  it("400 when src is not the org's connected number", async () => {
    const res = await post(app, { ...body, src: "+14159998888" });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("400 when WhatsApp is not connected", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ phoneNumberId: null, wabaAccessToken: null });
    expect((await post(app, body)).statusCode).toBe(400);
  });

  it("400 for an unsafe per-message callback URL", async () => {
    expect((await post(app, { ...body, url: "https://bad.example.com/cb" })).statusCode).toBe(400);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("template: resolves by org+name+language+approved; 400 when missing or ambiguous", async () => {
    const tpl = { name: "welcome", language: "en_US", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hi {{1}}" }] };
    mockPrisma.template.findMany.mockResolvedValue([tpl]);
    const ok = await post(app, { ...body, template: { name: "welcome", language: "en_US", components: [{ type: "body", parameters: [{ type: "text", text: "Ann" }] }] } });
    expect(ok.statusCode).toBe(202);
    expect(mockPrisma.template.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1", name: "welcome", language: "en_US", status: "approved" });
    expect(sendAdd.mock.calls[0]![1].content).toMatchObject({ kind: "template", name: "welcome", language: "en_US", components: [{ type: "body", parameters: [{ type: "text", text: "Ann" }] }] });
    mockPrisma.template.findMany.mockResolvedValue([]);
    expect((await post(app, { ...body, template: { name: "nope", language: "en" } })).statusCode).toBe(400);
    mockPrisma.template.findMany.mockResolvedValue([tpl, tpl]);
    expect((await post(app, { ...body, template: { name: "welcome", language: "en_US" } })).statusCode).toBe(400);
  });

  it("maps location and interactive content into the queued job", async () => {
    await post(app, { ...body, text: undefined, location: { latitude: "1", longitude: "2", name: "n", address: "a" } });
    expect(sendAdd.mock.calls[0]![1].content).toMatchObject({ kind: "location" });
    sendAdd.mockClear();
    await post(app, { ...body, text: undefined, interactive: { type: "button", body: { text: "Pick" }, action: { buttons: [{ title: "A", id: "1" }] } } });
    expect(sendAdd.mock.calls[0]![1].content).toMatchObject({ kind: "interactive", interactive: { type: "button" } });
  });
});
```

- [ ] **Step 7: Run to verify it fails**, `npx vitest run src/routes/public-api/messages.test.ts`.

- [ ] **Step 8: Implement `routes/public-api/messages.ts` (POST only for now)**

```ts
import type { FastifyPluginAsync } from "fastify";
import { newApiId, plivoError } from "../../lib/public-api/responses.js";
import {
  parseSendBody, SendValidationError, toMetaInteractive, toMetaTemplateComponents, renderTemplateForInbox,
  type SendContent,
} from "../../lib/public-api/send-mapping.js";
import { assertSafeCallbackUrl, UnsafeUrlError } from "../../lib/public-api/safe-url.js";
import { publicApiSendQueue, type SendContentForWorker } from "../../lib/public-api/queues.js";
import { enqueueStatusCallback } from "../../lib/public-api/callbacks.js";

const PUBLIC = { config: { public: true } } as const;
const both = (p: string) => [p, p.replace(/\/$/, "")];

function inboxFields(content: SendContentForWorker, templateBody: string | null) {
  switch (content.kind) {
    case "text": return { contentType: "text", body: content.text, mediaUrl: null };
    case "media": return { contentType: "media", body: content.caption, mediaUrl: content.mediaUrl };
    case "template": return { contentType: "template", body: templateBody, mediaUrl: null };
    case "location": return { contentType: "location", body: `📍 Location: ${content.name} (${content.latitude},${content.longitude})`, mediaUrl: null };
    case "interactive": return { contentType: "interactive", body: JSON.stringify(content.interactive), mediaUrl: null };
  }
}

export const publicApiMessagesRouter: FastifyPluginAsync = async (fastify) => {
  for (const path of both("/Message/")) {
    fastify.post<{ Params: { authId: string }; Body: unknown }>(path, PUBLIC, async (request, reply) => {
      const { organizationId, apiKeyId } = request.publicApi!;

      let parsed;
      try { parsed = parseSendBody(request.body); }
      catch (err) {
        if (err instanceof SendValidationError) return plivoError(reply, 400, err.message);
        throw err;
      }

      const [org, numberRow] = await Promise.all([
        fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { phoneNumberId: true, wabaAccessToken: true } }),
        fastify.prisma.vendorSetting.findFirst({ where: { organizationId, key: "current_phone_number_number" }, select: { value: true } }),
      ]);
      if (!org?.phoneNumberId || !org.wabaAccessToken) return plivoError(reply, 400, "WhatsApp number is not connected");
      const connected = (numberRow?.value ?? "").replace(/\D/g, "");
      if (!connected || connected !== parsed.src) return plivoError(reply, 400, "src is not the WhatsApp Business number of this account");

      if (parsed.callbackUrl) {
        try { await assertSafeCallbackUrl(parsed.callbackUrl); }
        catch (err) {
          if (err instanceof UnsafeUrlError) return plivoError(reply, 400, `url: ${err.message}`);
          throw err;
        }
      }

      // Build the worker payload; template and interactive are resolved/mapped here so bad input fails fast with 400.
      let content: SendContentForWorker;
      let templateBody: string | null = null;
      try {
        const c: SendContent = parsed.content;
        if (c.kind === "template") {
          const found = await fastify.prisma.template.findMany({
            where: { organizationId, name: c.name, language: c.language, status: "approved" },
            select: { name: true, language: true, components: true },
            take: 2,
          });
          if (found.length === 0) throw new SendValidationError("Template not found or not approved");
          if (found.length > 1) throw new SendValidationError("Template name and language match more than one template");
          const stored = (found[0]!.components ?? []) as unknown[];
          const headerFormat = (stored as Array<{ type?: string; format?: string }>).find((s) => s.type?.toUpperCase() === "HEADER")?.format ?? null;
          content = { kind: "template", name: c.name, language: c.language, components: toMetaTemplateComponents(c.components, headerFormat) };
          templateBody = renderTemplateForInbox(c.name, stored, c.components);
        } else if (c.kind === "interactive") {
          content = { kind: "interactive", interactive: toMetaInteractive(c.interactive) };
        } else {
          content = c;
        }
      } catch (err) {
        if (err instanceof SendValidationError) return plivoError(reply, 400, err.message);
        throw err;
      }

      const fields = inboxFields(content, templateBody);
      const callbackUrl = parsed.callbackUrl ?? null; // per-message override only; the credential default is resolved at callback time
      const uuids: string[] = [];
      for (const dst of parsed.dsts) {
        const contact = await fastify.prisma.contact.upsert({
          where: { organizationId_phoneNumber: { organizationId, phoneNumber: dst } },
          create: { organizationId, phoneNumber: dst },
          update: {},
          select: { id: true },
        });
        let conversation = await fastify.prisma.conversation.findFirst({ where: { organizationId, whatsappContactId: dst } });
        if (!conversation) {
          conversation = await fastify.prisma.conversation.create({
            data: { organizationId, contactId: contact.id, whatsappContactId: dst, channelType: "whatsapp", status: "open" },
          });
        }
        const message = await fastify.prisma.message.create({
          data: {
            conversationId: conversation.id, organizationId, direction: "outbound",
            contentType: fields.contentType, body: fields.body, mediaUrl: fields.mediaUrl, status: "sending",
          },
        });
        await fastify.prisma.apiMessageMeta.create({
          data: { messageId: message.id, apiKeyId, organizationId, dst, callbackUrl, callbackMethod: parsed.callbackMethod },
        });
        await publicApiSendQueue.add("send", { messageId: message.id, organizationId, to: dst, content }, { jobId: `pubsend-${message.id}` });
        await enqueueStatusCallback(fastify.prisma, message.id, "queued");
        uuids.push(message.id);
      }

      return reply.status(202).send({ api_id: newApiId(), message: "message(s) queued", message_uuid: uuids });
    });
  }
};
```
(The closing `};` ends `publicApiMessagesRouter`; Task 11 adds the GET handlers inside it, before this line.)

- [ ] **Step 9: Run to verify it passes**, `npx vitest run src/routes/public-api/messages.test.ts src/lib/public-api/callbacks.test.ts`; then `npx tsc --noEmit`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/lib/public-api/queues.ts apps/api/src/lib/public-api/callbacks.ts apps/api/src/lib/public-api/callbacks.test.ts apps/api/src/routes/public-api/messages.ts apps/api/src/routes/public-api/messages.test.ts
git commit -m "feat(public-api): POST /Message/ accepts sends and queues them with status callbacks" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Send worker (delivers accepted messages to Meta)

**Files:**
- Create: `apps/api/src/workers/public-api-send.worker.ts`
- Test: `apps/api/src/workers/public-api-send.worker.test.ts`

**Interfaces:**
- Consumes: `SendJob` (Task 8), `enqueueStatusCallback` (Task 8), `plivoErrorFromMeta` (Task 4), `sendTextMessage`/`sendMediaMessage`/`sendTemplateMessage`/`sendInteractiveMessage`/`sendLocationMessage`/`WaApiError` (`lib/whatsapp.ts`), `inferMediaKind` (Task 7), `getIo` (`lib/io-ref.ts`).
- Produces: `processSendJob(job: { data: SendJob }): Promise<void>`, `startPublicApiSendWorker(): Worker`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const prisma = {
  message: { findFirst: vi.fn(), update: vi.fn() },
  organization: { findUnique: vi.fn() },
  conversation: { update: vi.fn() },
};
vi.mock("../lib/prisma.js", () => ({ prisma }));
const enqueueCb = vi.fn();
vi.mock("../lib/public-api/callbacks.js", () => ({ enqueueStatusCallback: (...a: unknown[]) => enqueueCb(...a) }));
vi.mock("../lib/public-api/queues.js", () => ({ publicApiSendQueue: {}, publicApiCallbackQueue: {} }));
vi.mock("../lib/queue.js", () => ({ redisConnection: {} }));
vi.mock("../lib/io-ref.js", () => ({ getIo: () => null }));
const wa = {
  sendTextMessage: vi.fn(), sendMediaMessage: vi.fn(), sendTemplateMessage: vi.fn(), sendInteractiveMessage: vi.fn(), sendLocationMessage: vi.fn(),
};
vi.mock("../lib/whatsapp.js", async () => {
  class WaApiError extends Error { constructor(m: string, readonly metaCode: number | null, readonly metaSubcode: number | null) { super(m); } }
  return { ...wa, WaApiError };
});

import { processSendJob } from "./public-api-send.worker.js";
import { WaApiError } from "../lib/whatsapp.js";

const job = (content: unknown) => ({ data: { messageId: "m1", organizationId: "org-1", to: "14151112222", content } }) as never;

describe("processSendJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.message.findFirst.mockResolvedValue({ id: "m1", status: "sending", conversationId: "conv-1" });
    prisma.organization.findUnique.mockResolvedValue({ phoneNumberId: "pn-1", wabaAccessToken: "tok" });
    prisma.message.update.mockResolvedValue({});
    prisma.conversation.update.mockResolvedValue({});
  });

  it("sends text, marks the message sent with the wamid, queues a 'sent' callback (org-scoped lookups)", async () => {
    wa.sendTextMessage.mockResolvedValue({ messageId: "wamid.1" });
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(prisma.message.findFirst.mock.calls[0]![0].where).toMatchObject({ id: "m1", organizationId: "org-1" });
    expect(wa.sendTextMessage).toHaveBeenCalledWith("pn-1", "14151112222", "hi", "tok");
    expect(prisma.message.update.mock.calls[0]![0]).toMatchObject({ where: { id: "m1" }, data: { status: "sent", whatsappMessageId: "wamid.1" } });
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "sent");
  });

  it("dispatches by content kind", async () => {
    for (const fn of Object.values(wa)) fn.mockResolvedValue({ messageId: "w" });
    await processSendJob(job({ kind: "media", mediaUrl: "https://x/a.mp4", caption: "c" }));
    expect(wa.sendMediaMessage).toHaveBeenCalledWith("pn-1", "14151112222", "video", "https://x/a.mp4", "c", "tok");
    await processSendJob(job({ kind: "template", name: "t", language: "en", components: [] }));
    expect(wa.sendTemplateMessage).toHaveBeenCalledWith("pn-1", "14151112222", "t", "en", [], "tok");
    await processSendJob(job({ kind: "location", latitude: "1", longitude: "2", name: "n", address: "a" }));
    expect(wa.sendLocationMessage).toHaveBeenCalled();
    await processSendJob(job({ kind: "interactive", interactive: { type: "button", body: { text: "b" }, action: {} } }));
    expect(wa.sendInteractiveMessage).toHaveBeenCalled();
  });

  it("on a Meta rejection: message failed, mapped Plivo error code, 'failed' callback, no throw", async () => {
    wa.sendTextMessage.mockRejectedValue(new WaApiError("WA send failed: {...}", 131047, null));
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(prisma.message.update.mock.calls[0]![0]).toMatchObject({ data: { status: "failed" } });
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "failed", { errorCode: "380" });
  });

  it("unmapped errors still fail the message and queue a failed callback without an error code", async () => {
    wa.sendTextMessage.mockRejectedValue(new Error("network down"));
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(prisma.message.update.mock.calls[0]![0]).toMatchObject({ data: { status: "failed" } });
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "failed", { errorCode: null });
  });

  it("fails the message when WhatsApp was disconnected after acceptance", async () => {
    prisma.organization.findUnique.mockResolvedValue({ phoneNumberId: null, wabaAccessToken: null });
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(wa.sendTextMessage).not.toHaveBeenCalled();
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "failed", { errorCode: "310" });
  });

  it("is idempotent: skips messages that are not 'sending' or not found for the org", async () => {
    prisma.message.findFirst.mockResolvedValue({ id: "m1", status: "sent", conversationId: "conv-1" });
    await processSendJob(job({ kind: "text", text: "hi" }));
    prisma.message.findFirst.mockResolvedValue(null);
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(wa.sendTextMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**, `npx vitest run src/workers/public-api-send.worker.test.ts`.

- [ ] **Step 3: Implement the worker**

```ts
import { Worker, type Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { getIo } from "../lib/io-ref.js";
import { enqueueStatusCallback } from "../lib/public-api/callbacks.js";
import { plivoErrorFromMeta } from "../lib/public-api/meta-errors.js";
import { inferMediaKind } from "../lib/public-api/send-mapping.js";
import type { SendJob } from "../lib/public-api/queues.js";
import {
  sendTextMessage, sendMediaMessage, sendTemplateMessage, sendInteractiveMessage, sendLocationMessage, WaApiError,
} from "../lib/whatsapp.js";

async function fail(messageId: string, errorCode: string | null): Promise<void> {
  await prisma.message.update({ where: { id: messageId }, data: { status: "failed" } });
  await enqueueStatusCallback(prisma, messageId, "failed", { errorCode });
}

export async function processSendJob(job: Pick<Job<SendJob>, "data">): Promise<void> {
  const { messageId, organizationId, to, content } = job.data;

  const message = await prisma.message.findFirst({
    where: { id: messageId, organizationId },
    select: { id: true, status: true, conversationId: true },
  });
  if (!message || message.status !== "sending") return; // already handled, expired, or not ours

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { phoneNumberId: true, wabaAccessToken: true },
  });
  if (!org?.phoneNumberId || !org.wabaAccessToken) return fail(messageId, "310");
  const { phoneNumberId, wabaAccessToken: token } = org;

  let wamid: string;
  try {
    switch (content.kind) {
      case "text": ({ messageId: wamid } = await sendTextMessage(phoneNumberId, to, content.text, token)); break;
      case "media": ({ messageId: wamid } = await sendMediaMessage(phoneNumberId, to, inferMediaKind(content.mediaUrl), content.mediaUrl, content.caption ?? undefined, token)); break;
      case "template": ({ messageId: wamid } = await sendTemplateMessage(phoneNumberId, to, content.name, content.language, content.components, token)); break;
      case "location": ({ messageId: wamid } = await sendLocationMessage(phoneNumberId, to, content, token)); break;
      case "interactive": ({ messageId: wamid } = await sendInteractiveMessage(phoneNumberId, to, content.interactive, token)); break;
    }
  } catch (err) {
    return fail(messageId, err instanceof WaApiError ? plivoErrorFromMeta(err.metaCode) : null);
  }

  const sentAt = new Date();
  await prisma.message.update({ where: { id: messageId }, data: { status: "sent", whatsappMessageId: wamid, sentAt } });
  await prisma.conversation.update({ where: { id: message.conversationId }, data: { lastMessageAt: sentAt } });
  getIo()?.to(`org:${organizationId}`).emit("new-message", { conversationId: message.conversationId, organizationId, direction: "outbound", sentAt: sentAt.toISOString() });
  await enqueueStatusCallback(prisma, messageId, "sent");
}

export function startPublicApiSendWorker() {
  const worker = new Worker<SendJob>("public-api-send", processSendJob, { connection: redisConnection, concurrency: 5 });
  worker.on("error", (err) => console.error(`[public-api-send] worker error: ${err.message}`));
  worker.on("failed", (job, err) => console.error(`[public-api-send] job ${job?.id} failed: ${err.message}`));
  return worker;
}
```
Note: `conversation.update` by id only is safe because `conversationId` comes from the org-scoped message row.

- [ ] **Step 4: Run to verify it passes**, `npx vitest run src/workers/public-api-send.worker.test.ts`; then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/public-api-send.worker.ts apps/api/src/workers/public-api-send.worker.test.ts
git commit -m "feat(public-api): send worker delivers accepted messages to Meta" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Callback delivery worker and Meta status forwarding

**Files:**
- Create: `apps/api/src/workers/public-api-callbacks.worker.ts`
- Modify: `apps/api/src/lib/public-api/callbacks.ts` (add `forwardMetaStatusToApiClient`), `apps/api/src/routes/webhooks.ts` (status loop at ~lines 141-166, `WaStatusUpdate` at 38-43)
- Test: `apps/api/src/workers/public-api-callbacks.worker.test.ts`, extend `callbacks.test.ts`

**Interfaces:**
- Consumes: `CallbackJob` (Task 8), `signV2`/`newNonce` (Task 3), `assertSafeCallbackUrl`/`UnsafeUrlError` (Task 3), `decryptToken` (Task 2).
- Produces:
  - `deliverCallback(job: { data: CallbackJob }, fetchImpl?: typeof fetch): Promise<void>` (throws on non-2xx so BullMQ retries; throws `UnrecoverableError` for unsafe URL / revoked or token-less credential)
  - `callbackBackoff(attemptsMade: number): number` returning 60000, 120000, 240000 for attempts 1-3
  - `startPublicApiCallbackWorker(): Worker`
  - `forwardMetaStatusToApiClient(prisma, messageId, su: MetaStatusUpdate): Promise<void>` where `MetaStatusUpdate = { status: string; errors?: Array<{ code?: number }>; conversation?: { id?: string; origin?: { type?: string }; expiration_timestamp?: string | number } }`

- [ ] **Step 1: Write the failing worker test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const prisma = { apiKey: { findUnique: vi.fn() } };
vi.mock("../lib/prisma.js", () => ({ prisma }));
vi.mock("../lib/queue.js", () => ({ redisConnection: {} }));
vi.mock("../lib/public-api/queues.js", () => ({ publicApiCallbackQueue: {}, publicApiSendQueue: {} }));
vi.mock("../lib/public-api/safe-url.js", async (orig) => {
  const real = await orig<typeof import("../lib/public-api/safe-url.js")>();
  return { ...real, assertSafeCallbackUrl: vi.fn(async (u: string) => { if (u.includes("internal")) throw new real.UnsafeUrlError("private"); return new URL(u); }) };
});

import { deliverCallback, callbackBackoff } from "./public-api-callbacks.worker.js";
import { encryptToken } from "../lib/public-api/credentials.js";
import { signV2 } from "../lib/public-api/plivo-signature.js";
import { UnrecoverableError } from "bullmq";

const data = (over: Record<string, unknown> = {}) => ({ data: { apiKeyId: "k1", organizationId: "org-1", url: "https://c.example.com/hook", method: "POST", fields: { MessageUUID: "m1", Status: "sent" }, ...over } }) as never;

describe("deliverCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["PUBLIC_API_TOKEN_KEY"] = Buffer.alloc(32, 5).toString("base64");
    prisma.apiKey.findUnique.mockResolvedValue({ tokenEnc: encryptToken("secret-token"), revokedAt: null });
  });

  it("POSTs form-encoded fields with a valid V2 signature, nonce and no redirect following", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await deliverCallback(data(), fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://c.example.com/hook");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(String(init.body)).toBe("MessageUUID=m1&Status=sent");
    const nonce = init.headers["X-Plivo-Signature-V2-Nonce"]!;
    expect(init.headers["X-Plivo-Signature-V2"]).toBe(signV2("https://c.example.com/hook", nonce, "secret-token"));
    expect(init.headers["X-Plivo-Signature-Ma-V2"]).toBe(init.headers["X-Plivo-Signature-V2"]);
  });

  it("GET callbacks carry fields in the query string and sign the URL without it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await deliverCallback(data({ method: "GET" }), fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://c.example.com/hook?MessageUUID=m1&Status=sent");
    expect(init.method).toBe("GET");
    expect(init.headers["X-Plivo-Signature-V2"]).toBe(signV2("https://c.example.com/hook", init.headers["X-Plivo-Signature-V2-Nonce"]!, "secret-token"));
  });

  it("throws (so BullMQ retries) on non-2xx, including redirects", async () => {
    for (const status of [500, 302, 404]) {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status });
      await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).rejects.toThrow(`HTTP ${status}`);
    }
  });

  it("does not retry (UnrecoverableError) for unsafe URLs, revoked or token-less credentials, and never fetches", async () => {
    const fetchMock = vi.fn();
    await expect(deliverCallback(data({ url: "https://internal.example.com/h" }), fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(UnrecoverableError);
    prisma.apiKey.findUnique.mockResolvedValue({ tokenEnc: encryptToken("t"), revokedAt: new Date() });
    await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(UnrecoverableError);
    prisma.apiKey.findUnique.mockResolvedValue({ tokenEnc: null, revokedAt: null });
    await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(UnrecoverableError);
    prisma.apiKey.findUnique.mockResolvedValue(null);
    await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks the credential up with the org it was queued for", async () => {
    prisma.apiKey.findUnique.mockResolvedValue({ tokenEnc: encryptToken("s"), revokedAt: null, organizationId: "org-OTHER" });
    const fetchMock = vi.fn();
    await expect(deliverCallback(data(), fetchMock as unknown as typeof fetch)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("callbackBackoff", () => {
  it("is 60s, 120s, 240s for the three retries", () => {
    expect([1, 2, 3].map(callbackBackoff)).toEqual([60000, 120000, 240000]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**, `npx vitest run src/workers/public-api-callbacks.worker.test.ts`.

- [ ] **Step 3: Implement the worker**

The credential row must be re-checked against `organizationId` (defence in depth), so select it:
```ts
import { Worker, UnrecoverableError, type Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { decryptToken } from "../lib/public-api/credentials.js";
import { newNonce, signV2 } from "../lib/public-api/plivo-signature.js";
import { assertSafeCallbackUrl, UnsafeUrlError } from "../lib/public-api/safe-url.js";
import type { CallbackJob } from "../lib/public-api/queues.js";

const TIMEOUT_MS = 10_000;

export function callbackBackoff(attemptsMade: number): number {
  return 60_000 * 2 ** (attemptsMade - 1); // 60 s, 120 s, 240 s
}

export async function deliverCallback(job: Pick<Job<CallbackJob>, "data">, fetchImpl: typeof fetch = fetch): Promise<void> {
  const { apiKeyId, organizationId, url, method, fields } = job.data;

  const key = await prisma.apiKey.findUnique({ where: { id: apiKeyId }, select: { tokenEnc: true, revokedAt: true, organizationId: true } });
  if (!key || key.organizationId !== organizationId || key.revokedAt || !key.tokenEnc) {
    throw new UnrecoverableError("credential unavailable");
  }
  try { await assertSafeCallbackUrl(url); }
  catch (err) {
    if (err instanceof UnsafeUrlError) throw new UnrecoverableError(`unsafe callback URL: ${err.message}`);
    throw err;
  }

  const nonce = newNonce();
  const signature = signV2(url, nonce, decryptToken(key.tokenEnc));
  const form = new URLSearchParams(fields).toString();
  const headers: Record<string, string> = {
    "X-Plivo-Signature-V2": signature,
    "X-Plivo-Signature-Ma-V2": signature,
    "X-Plivo-Signature-V2-Nonce": nonce,
  };
  const isGet = method === "GET";
  const res = await fetchImpl(isGet ? `${url}${url.includes("?") ? "&" : "?"}${form}` : url, {
    method,
    headers: isGet ? headers : { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    ...(isGet ? {} : { body: form }),
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`callback endpoint answered HTTP ${res.status}`);
}

export function startPublicApiCallbackWorker() {
  const worker = new Worker<CallbackJob>("public-api-callbacks", (job) => deliverCallback(job), {
    connection: redisConnection,
    concurrency: 10,
    settings: { backoffStrategy: callbackBackoff },
  });
  worker.on("error", (err) => console.error(`[public-api-callbacks] worker error: ${err.message}`));
  worker.on("failed", (job, err) => console.warn(`[public-api-callbacks] job ${job?.id} attempt ${job?.attemptsMade} failed: ${err.message}`));
  return worker;
}
```
Note: the test asserts the error message contains `HTTP 500` (`rejects.toThrow("HTTP 500")` is a substring match: "callback endpoint answered HTTP 500" contains it). The same-URL-in-error concern: the message never includes the URL or fields.

- [ ] **Step 4: Run to verify it passes**, `npx vitest run src/workers/public-api-callbacks.worker.test.ts`.

- [ ] **Step 5: Add the failing Meta-status-forwarding tests** to `callbacks.test.ts` (append):

```ts
import { forwardMetaStatusToApiClient } from "./callbacks.js";

describe("forwardMetaStatusToApiClient", () => {
  const prismaFwd = {
    apiMessageMeta: { findUnique: vi.fn(), updateMany: vi.fn() },
    apiKey: { findUnique: vi.fn() },
    vendorSetting: { findFirst: vi.fn() },
    message: { findUnique: vi.fn(), update: vi.fn() },
  };
  const PF = prismaFwd as unknown as PrismaClient;
  beforeEach(() => {
    vi.clearAllMocks();
    prismaFwd.apiKey.findUnique.mockResolvedValue({ callbackUrl: "https://c.example.com/cb" });
    prismaFwd.vendorSetting.findFirst.mockResolvedValue({ value: "14151112221" });
    prismaFwd.apiMessageMeta.updateMany.mockResolvedValue({ count: 1 });
    prismaFwd.message.findUnique.mockResolvedValue({ status: "sent" });
    prismaFwd.message.update.mockResolvedValue({});
  });

  it("ignores messages that were not sent through the API", async () => {
    prismaFwd.apiMessageMeta.findUnique.mockResolvedValue(null);
    await forwardMetaStatusToApiClient(PF, "m1", { status: "delivered" });
    expect(add).not.toHaveBeenCalled();
    expect(prismaFwd.message.update).not.toHaveBeenCalled();
  });

  it("forwards delivered and read with Meta's conversation info", async () => {
    prismaFwd.apiMessageMeta.findUnique.mockResolvedValue(meta({ lastStatus: "sent", sequence: 2 }));
    await forwardMetaStatusToApiClient(PF, "m1", { status: "delivered", conversation: { id: "c9", origin: { type: "service" }, expiration_timestamp: "1790000000" } });
    expect(add.mock.calls[0]![1].fields).toMatchObject({ Status: "delivered", ConversationID: "c9", ConversationOrigin: "service", ConversationExpirationTimestamp: "1790000000" });
  });

  it("ignores Meta's 'sent' (the send worker already reported it)", async () => {
    prismaFwd.apiMessageMeta.findUnique.mockResolvedValue(meta({ lastStatus: "sent" }));
    await forwardMetaStatusToApiClient(PF, "m1", { status: "sent" });
    expect(add).not.toHaveBeenCalled();
  });

  it("failed after sent: marks the message failed, reports 'undelivered' with the mapped error code", async () => {
    prismaFwd.apiMessageMeta.findUnique.mockResolvedValue(meta({ lastStatus: "sent" }));
    await forwardMetaStatusToApiClient(PF, "m1", { status: "failed", errors: [{ code: 131047 }] });
    expect(prismaFwd.message.update.mock.calls[0]![0]).toMatchObject({ where: { id: "m1" }, data: { status: "failed" } });
    expect(add.mock.calls[0]![1].fields).toMatchObject({ Status: "undelivered", ErrorCode: "380" });
  });

  it("failed before sent is reported as 'failed'", async () => {
    prismaFwd.apiMessageMeta.findUnique.mockResolvedValue(meta({ lastStatus: "queued" }));
    await forwardMetaStatusToApiClient(PF, "m1", { status: "failed" });
    expect(add.mock.calls[0]![1].fields.Status).toBe("failed");
  });

  it("does not overwrite delivered/read messages with failed", async () => {
    prismaFwd.apiMessageMeta.findUnique.mockResolvedValue(meta({ lastStatus: "read" }));
    prismaFwd.message.findUnique.mockResolvedValue({ status: "read" });
    await forwardMetaStatusToApiClient(PF, "m1", { status: "failed" });
    expect(prismaFwd.message.update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run to verify it fails**, `npx vitest run src/lib/public-api/callbacks.test.ts` (`forwardMetaStatusToApiClient` not exported).

- [ ] **Step 7: Implement `forwardMetaStatusToApiClient` in `callbacks.ts`** (append; add `import { plivoErrorFromMeta } from "./meta-errors.js";` at the top):

```ts
export interface MetaStatusUpdate {
  status: string;
  errors?: Array<{ code?: number }>;
  conversation?: { id?: string; origin?: { type?: string }; expiration_timestamp?: string | number };
}

/**
 * Called from the Meta status webhook for every status update. A no-op unless the message was sent through the
 * public API, so dashboard messages are untouched. Meta's `sent` is ignored: the send worker already reported it.
 */
export async function forwardMetaStatusToApiClient(prisma: PrismaClient, messageId: string, su: MetaStatusUpdate): Promise<void> {
  const meta = await prisma.apiMessageMeta.findUnique({ where: { messageId }, select: { messageId: true, lastStatus: true } });
  if (!meta) return;

  const conversation = su.conversation
    ? {
        ...(su.conversation.id ? { id: su.conversation.id } : {}),
        ...(su.conversation.origin?.type ? { origin: su.conversation.origin.type } : {}),
        ...(su.conversation.expiration_timestamp ? { expiration: Number(su.conversation.expiration_timestamp) } : {}),
      }
    : undefined;

  if (su.status === "delivered" || su.status === "read") {
    await enqueueStatusCallback(prisma, messageId, su.status, conversation ? { conversation } : {});
    return;
  }
  if (su.status === "failed") {
    if (!canAdvance(meta.lastStatus, "failed")) return;
    const current = await prisma.message.findUnique({ where: { id: messageId }, select: { status: true } });
    if (current && current.status !== "delivered" && current.status !== "read") {
      await prisma.message.update({ where: { id: messageId }, data: { status: "failed" } });
    }
    const next: PlivoStatus = meta.lastStatus === "sent" ? "undelivered" : "failed";
    await enqueueStatusCallback(prisma, messageId, next, { errorCode: plivoErrorFromMeta(su.errors?.[0]?.code) });
  }
}
```

- [ ] **Step 8: Run to verify it passes**, `npx vitest run src/lib/public-api/callbacks.test.ts`.

- [ ] **Step 9: Hook into the Meta status webhook**

In `routes/webhooks.ts` extend `WaStatusUpdate` (lines 38-43):
```ts
interface WaStatusUpdate {
  id: string; // whatsappMessageId
  status: string; // "sent" | "delivered" | "read" | "failed"
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code?: number }>;
  conversation?: { id?: string; origin?: { type?: string }; expiration_timestamp?: string | number };
}
```
Add the import `import { forwardMetaStatusToApiClient } from "../lib/public-api/callbacks.js";`. Inside the `for (const su of change.value.statuses)` loop, immediately after the `const msg = await fastify.prisma.message.findFirst({...});` statement (line ~146) and BEFORE `if (msg && !TERMINAL.has(msg.status)) {`, insert:
```ts
              if (msg) {
                // Public API clients: no-op for messages not sent through the API; never blocks the Meta 200.
                await forwardMetaStatusToApiClient(fastify.prisma, msg.id, su).catch((err: unknown) => {
                  fastify.log.error({ err }, "public-api status forward failed");
                });
              }
```
(Placing it before the existing update means a `failed` status is handled even though the existing ratchet ignores `failed` for dashboard messages.)

- [ ] **Step 10: Run the existing webhook tests and the new tests**

Run: `npx vitest run src/routes/webhooks.test.ts src/lib/public-api src/workers/public-api-callbacks.worker.test.ts`
Expected: PASS (existing `webhooks.test.ts` must stay green; if its prisma mock lacks `apiMessageMeta`, the `.catch` swallows the TypeError, but add `apiMessageMeta: { findUnique: vi.fn().mockResolvedValue(null) }` to that mock if the logger output is noisy).

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/workers/public-api-callbacks.worker.ts apps/api/src/workers/public-api-callbacks.worker.test.ts apps/api/src/lib/public-api/callbacks.ts apps/api/src/lib/public-api/callbacks.test.ts apps/api/src/routes/webhooks.ts apps/api/src/routes/webhooks.test.ts
git commit -m "feat(public-api): signed callback delivery with retry; forward Meta statuses of API messages" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: `GET /Message/` and `GET /Message/{uuid}/`

**Files:**
- Modify: `apps/api/src/routes/public-api/messages.ts`
- Test: extend `apps/api/src/routes/public-api/messages.test.ts`

**Interfaces:**
- Produces:
  - `GET /Message/?limit&offset&message_direction&message_state&message_type&message_time__gt&message_time__lt&error_code&subaccount`
    returns `{ api_id, meta: { limit, offset, total_count, previous, next }, objects: MessageObject[] }`
  - `GET /Message/:uuid/` returns one `MessageObject` (with `api_id`) or 404.
  - `MessageObject`: `{ message_uuid, message_direction: "outbound", message_state, message_type: "whatsapp", message_time, from_number, to_number, units, total_rate, total_amount, error_code, conversation_id, conversation_origin }` **[PROVISIONAL: field set and time format from Plivo docs]**.
- Scope decision: lists only messages sent through the API (rows with `api_message_meta`); inbound messages are not listed (document this in the client-facing docs).

- [ ] **Step 1: Write the failing tests** (append to `messages.test.ts`; add `findMany`, `count`, `findFirst` to `mockPrisma.apiMessageMeta`):

```ts
describe("GET /Message/", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    Object.assign(mockPrisma.apiMessageMeta, { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() });
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "+1 415-111-2221" });
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  const row = (over: Record<string, unknown> = {}) => ({
    messageId: "m1", dst: "14151112222", lastStatus: "delivered", errorCode: null, queuedAt: new Date("2026-10-05T10:00:00Z"),
    message: { id: "m1", status: "delivered" }, ...over,
  });

  it("lists org-scoped API messages with Plivo pagination meta", async () => {
    (mockPrisma.apiMessageMeta as any).findMany.mockResolvedValue([row()]);
    (mockPrisma.apiMessageMeta as any).count.mockResolvedValue(45);
    const res = await app.inject({ method: "GET", url: "/v1/Account/k1/Message/?limit=20&offset=20" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ meta: Record<string, unknown>; objects: Array<Record<string, unknown>> }>();
    expect(body.meta).toMatchObject({ limit: 20, offset: 20, total_count: 45, previous: expect.any(String), next: expect.any(String) });
    expect(body.objects[0]).toMatchObject({ message_uuid: "m1", message_direction: "outbound", message_state: "delivered", message_type: "whatsapp", from_number: "14151112221", to_number: "14151112222", message_time: "2026-10-05 10:00:00+00:00" });
    const where = (mockPrisma.apiMessageMeta as any).findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: "org-1" });
  });

  it("caps limit at 20 and applies filters", async () => {
    (mockPrisma.apiMessageMeta as any).findMany.mockResolvedValue([]);
    (mockPrisma.apiMessageMeta as any).count.mockResolvedValue(0);
    await app.inject({ method: "GET", url: "/v1/Account/k1/Message/?limit=500&message_state=failed&error_code=380&message_time__gt=2026-10-05%2000:00:00" });
    const arg = (mockPrisma.apiMessageMeta as any).findMany.mock.calls[0][0];
    expect(arg.take).toBe(20);
    expect(arg.where).toMatchObject({ organizationId: "org-1", lastStatus: "failed", errorCode: "380" });
    expect(arg.where.queuedAt.gt).toEqual(new Date("2026-10-05T00:00:00Z"));
  });

  it("returns an empty page for inbound direction (inbound messages are not API-listed)", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/Account/k1/Message/?message_direction=inbound" });
    expect(res.json<{ objects: unknown[] }>().objects).toEqual([]);
    expect((mockPrisma.apiMessageMeta as any).findMany).not.toHaveBeenCalled();
  });

  it("400 for a bad time filter", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/Account/k1/Message/?message_time__gt=garbage" })).statusCode).toBe(400);
  });
});

describe("GET /Message/:uuid/", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    Object.assign(mockPrisma.apiMessageMeta, { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() });
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "14151112221" });
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("returns the message, looked up by uuid AND org", async () => {
    (mockPrisma.apiMessageMeta as any).findFirst.mockResolvedValue({ messageId: "m1", dst: "14151112222", lastStatus: "sent", errorCode: null, queuedAt: new Date("2026-10-05T10:00:00Z"), message: { id: "m1", status: "sent" } });
    const res = await app.inject({ method: "GET", url: "/v1/Account/k1/Message/m1/" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ message_uuid: "m1", message_state: "sent", api_id: expect.any(String) });
    expect((mockPrisma.apiMessageMeta as any).findFirst.mock.calls[0][0].where).toEqual({ messageId: "m1", organizationId: "org-1" });
  });

  it("404 (same body as unknown) for another org's message", async () => {
    (mockPrisma.apiMessageMeta as any).findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/Account/k1/Message/other-org-msg/" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: expect.any(String), api_id: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run to verify it fails**, `npx vitest run src/routes/public-api/messages.test.ts`.

- [ ] **Step 3: Implement the GET handlers** (inside `publicApiMessagesRouter`, after the POST loop; add `import { businessNumberDigits } from "../../lib/public-api/callbacks.js";` next to the existing callbacks import, and a helper):

```ts
const MAX_LIMIT = 20;

function plivoMessageTime(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace("T", " ")}+00:00`;
}

function parseTime(v: string | undefined): Date | null | "invalid" {
  if (!v) return null;
  const d = new Date(`${v.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

function toMessageObject(
  row: { messageId: string; dst: string; lastStatus: string | null; errorCode: string | null; queuedAt: Date; message: { status: string } },
  from: string
) {
  return {
    message_uuid: row.messageId,
    message_direction: "outbound",
    message_state: row.lastStatus ?? row.message.status,
    message_type: "whatsapp",
    message_time: plivoMessageTime(row.queuedAt),
    from_number: from,
    to_number: row.dst,
    units: 1,
    total_rate: "0",
    total_amount: "0",
    error_code: row.errorCode ? Number(row.errorCode) : null,
    conversation_id: null,
    conversation_origin: null,
  };
}

  for (const path of both("/Message/")) {
    fastify.get<{ Params: { authId: string }; Querystring: Record<string, string | undefined> }>(path, PUBLIC, async (request, reply) => {
      const { organizationId } = request.publicApi!;
      const q = request.query;
      const limit = Math.min(Math.max(parseInt(q["limit"] ?? "", 10) || MAX_LIMIT, 1), MAX_LIMIT);
      const offset = Math.max(parseInt(q["offset"] ?? "", 10) || 0, 0);
      const gt = parseTime(q["message_time__gt"]);
      const lt = parseTime(q["message_time__lt"]);
      if (gt === "invalid" || lt === "invalid") return plivoError(reply, 400, "message_time filters must be yyyy-MM-dd HH:mm:ss");

      const base = `/v1/Account/${request.params.authId}/Message/`;
      const meta = (total: number) => ({
        limit, offset, total_count: total,
        previous: offset > 0 ? `${base}?limit=${limit}&offset=${Math.max(offset - limit, 0)}` : null,
        next: offset + limit < total ? `${base}?limit=${limit}&offset=${offset + limit}` : null,
      });

      if (q["message_direction"] === "inbound" || (q["message_type"] && q["message_type"] !== "whatsapp")) {
        return reply.send({ api_id: newApiId(), meta: meta(0), objects: [] });
      }

      const where = {
        organizationId,
        ...(q["message_state"] ? { lastStatus: q["message_state"] } : {}),
        ...(q["error_code"] ? { errorCode: q["error_code"] } : {}),
        ...(gt || lt ? { queuedAt: { ...(gt ? { gt } : {}), ...(lt ? { lt } : {}) } } : {}),
      };
      const [rows, total, from] = await Promise.all([
        fastify.prisma.apiMessageMeta.findMany({
          where, orderBy: { queuedAt: "desc" }, skip: offset, take: limit,
          include: { message: { select: { id: true, status: true } } },
        }),
        fastify.prisma.apiMessageMeta.count({ where }),
        businessNumberDigits(fastify.prisma, organizationId),
      ]);
      return reply.send({ api_id: newApiId(), meta: meta(total), objects: rows.map((r) => toMessageObject(r, from)) });
    });
  }

  for (const path of both("/Message/:uuid/")) {
    fastify.get<{ Params: { authId: string; uuid: string } }>(path, PUBLIC, async (request, reply) => {
      const { organizationId } = request.publicApi!;
      const row = await fastify.prisma.apiMessageMeta.findFirst({
        where: { messageId: request.params.uuid, organizationId },
        include: { message: { select: { id: true, status: true } } },
      });
      if (!row) return plivoError(reply, 404, "not found");
      const from = await businessNumberDigits(fastify.prisma, organizationId);
      return reply.send({ api_id: newApiId(), ...toMessageObject(row, from) });
    });
  }
```
Note: the test file mocks `../../lib/public-api/callbacks.js` with `businessNumberDigits: vi.fn()`; update that mock in this task to `businessNumberDigits: vi.fn(async (p: any, org: string) => { const r = await p.vendorSetting.findFirst({ where: { organizationId: org, key: "current_phone_number_number" } }); return (r?.value ?? "").replace(/\D/g, ""); })` so the GET tests see the stubbed number. Also `const both = ...` for `/Message/:uuid/` yields `["/Message/:uuid/", "/Message/:uuid"]`.

- [ ] **Step 4: Run to verify it passes**, `npx vitest run src/routes/public-api/messages.test.ts`; then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/public-api/messages.ts apps/api/src/routes/public-api/messages.test.ts
git commit -m "feat(public-api): GET /Message/ list and retrieve (org-scoped, API-sent messages)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Inbound forwarding to the client **[PROVISIONAL payload]**

**Files:**
- Modify: `apps/api/src/lib/public-api/callbacks.ts` (add `forwardInboundToApiClient`), `apps/api/src/workers/inbound-message.worker.ts` (after the `dispatchWebhook(...)` call at ~line 436-443)
- Test: extend `callbacks.test.ts`

**Interfaces:**
- Produces: `forwardInboundToApiClient(prisma, args: { organizationId: string; messageId: string; fromPhone: string; text: string | null }): Promise<void>`: for every non-revoked credential of the org with `inboundUrl`, enqueue a `"inbound"` callback job with fields `From`, `To`, `Text`, `Type: "whatsapp"`, `MessageUUID`.
- Only the documented Plivo inbound fields are implemented. Media, location and interactive-reply fields are NOT sent until the client provides a real sample (Q2); until then such messages are forwarded with an empty `Text` and a `ContentType` field is NOT added (do not invent fields).

- [ ] **Step 1: Write the failing test** (append to `callbacks.test.ts`; add `apiKey: { findMany: vi.fn() }` to a local prisma object):

```ts
import { forwardInboundToApiClient } from "./callbacks.js";

describe("forwardInboundToApiClient", () => {
  const p = { apiKey: { findMany: vi.fn() }, vendorSetting: { findFirst: vi.fn() } };
  beforeEach(() => { vi.clearAllMocks(); p.vendorSetting.findFirst.mockResolvedValue({ value: "+1 415-111-2221" }); });

  it("queues one inbound callback per active credential with an inbound URL, scoped to the org", async () => {
    p.apiKey.findMany.mockResolvedValue([{ id: "k1", inboundUrl: "https://c.example.com/in" }, { id: "k2", inboundUrl: "https://d.example.com/in" }]);
    await forwardInboundToApiClient(p as unknown as PrismaClient, { organizationId: "org-1", messageId: "m9", fromPhone: "14151112222", text: "hello" });
    expect(p.apiKey.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1", revokedAt: null, inboundUrl: { not: null } });
    expect(add).toHaveBeenCalledTimes(2);
    const [name, data] = add.mock.calls[0]!;
    expect(name).toBe("inbound");
    expect(data).toMatchObject({ apiKeyId: "k1", organizationId: "org-1", url: "https://c.example.com/in", method: "POST", fields: { From: "14151112222", To: "14151112221", Text: "hello", Type: "whatsapp", MessageUUID: "m9" } });
  });

  it("sends an empty Text for non-text messages and does nothing without credentials", async () => {
    p.apiKey.findMany.mockResolvedValue([{ id: "k1", inboundUrl: "https://c.example.com/in" }]);
    await forwardInboundToApiClient(p as unknown as PrismaClient, { organizationId: "org-1", messageId: "m9", fromPhone: "1", text: null });
    expect(add.mock.calls[0]![1].fields.Text).toBe("");
    add.mockClear();
    p.apiKey.findMany.mockResolvedValue([]);
    await forwardInboundToApiClient(p as unknown as PrismaClient, { organizationId: "org-1", messageId: "m9", fromPhone: "1", text: "x" });
    expect(add).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**, `npx vitest run src/lib/public-api/callbacks.test.ts`.

- [ ] **Step 3: Implement** (append to `callbacks.ts`):

```ts
export async function forwardInboundToApiClient(
  prisma: PrismaClient,
  args: { organizationId: string; messageId: string; fromPhone: string; text: string | null }
): Promise<void> {
  const keys = await prisma.apiKey.findMany({
    where: { organizationId: args.organizationId, revokedAt: null, inboundUrl: { not: null } },
    select: { id: true, inboundUrl: true },
  });
  if (keys.length === 0) return;
  const to = await businessNumberDigits(prisma, args.organizationId);
  const fields = { From: args.fromPhone, To: to, Text: args.text ?? "", Type: "whatsapp", MessageUUID: args.messageId };
  await Promise.all(keys.map((k) =>
    publicApiCallbackQueue.add("inbound", { apiKeyId: k.id, organizationId: args.organizationId, url: k.inboundUrl!, method: "POST", fields })
  ));
}
```

- [ ] **Step 4: Hook the inbound worker**

In `workers/inbound-message.worker.ts` add `import { forwardInboundToApiClient } from "../lib/public-api/callbacks.js";` and, right after the existing `void dispatchWebhook(...)` call (before the `console.log` DONE line):
```ts
    if (process.env["PUBLIC_API_ENABLED"] === "true") {
      void forwardInboundToApiClient(prisma, {
        organizationId, messageId: storedMessage.id, fromPhone: whatsappContactPhone, text: body,
      }).catch((err: unknown) => console.error(`[worker:inbound] public-api forward failed: ${(err as Error).message}`));
    }
```
(Inbound messages whose delivery fails never block or fail the inbound pipeline.)

- [ ] **Step 5: Run the tests**, `npx vitest run src/lib/public-api/callbacks.test.ts src/workers` (the existing inbound worker tests, if any, must stay green), then `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/public-api/callbacks.ts apps/api/src/lib/public-api/callbacks.test.ts apps/api/src/workers/inbound-message.worker.ts
git commit -m "feat(public-api): forward inbound WhatsApp messages to the client's inbound URL" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Plugin wiring, rate limit, workers, env

**Files:**
- Create: `apps/api/src/routes/public-api/index.ts`
- Modify: `apps/api/src/routes/index.ts`, `apps/api/src/index.ts`, `.env.example`
- Test: `apps/api/src/routes/public-api/index.test.ts`

**Interfaces:**
- Consumes: `publicApiAuth` (Task 5), `publicApiMessagesRouter` (Tasks 8, 11), `redisConnection` (`lib/queue.ts`).
- Produces: `publicApiRouter` (prefix `/v1/Account/:authId`), `startPublicApiSendWorker`/`startPublicApiCallbackWorker` started only when `PUBLIC_API_ENABLED=true`.

Observation to verify while doing this task: `server.register(rateLimitPlugin)` in `src/index.ts` registers `@fastify/rate-limit` inside a non-`fp` plugin, so its hooks may apply only to that encapsulated context and not to `routes`. If true, the existing global 60 req/min limiter does not protect the API. The public plugin below therefore registers its own limiter inside its own context. Report the finding to the user separately; do NOT change the global plugin in this task.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { hashToken } from "../../lib/public-api/credentials.js";

vi.mock("../../lib/queue.js", () => ({ redisConnection: undefined })); // in-memory rate limit store
vi.mock("../../lib/public-api/queues.js", () => ({ publicApiSendQueue: { add: vi.fn() }, publicApiCallbackQueue: { add: vi.fn() } }));

const mockPrisma = {
  apiKey: { findUnique: vi.fn(), update: vi.fn() },
  organization: { findUnique: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
  apiMessageMeta: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
};
const ID = "11111111-1111-1111-1111-111111111111";
const auth = `Basic ${Buffer.from(`${ID}:good`).toString("base64")}`;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  // simulate the global Clerk hook: it must skip routes marked public
  app.addHook("preHandler", async (request, reply) => {
    if (!(request.routeOptions?.config as { public?: boolean } | undefined)?.public) return reply.status(401).send({ error: "clerk" });
  });
  const { publicApiRouter } = await import("./index.js");
  await app.register(publicApiRouter, { prefix: "/v1/Account/:authId" });
  return app;
}

describe("publicApiRouter", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    process.env["PUBLIC_API_RATE_LIMIT"] = "3";
    mockPrisma.apiKey.findUnique.mockResolvedValue({ id: ID, organizationId: "org-1", keyHash: hashToken("good"), revokedAt: null, lastUsedAt: new Date() });
    mockPrisma.organization.findUnique.mockResolvedValue({ status: "active" });
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "1" });
    mockPrisma.apiMessageMeta.findMany.mockResolvedValue([]);
    mockPrisma.apiMessageMeta.count.mockResolvedValue(0);
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); delete process.env["PUBLIC_API_RATE_LIMIT"]; });

  const list = (headers: Record<string, string> = { authorization: auth }) =>
    app.inject({ method: "GET", url: `/v1/Account/${ID}/Message/`, headers });

  it("serves public routes with Basic auth (Clerk hook does not apply) and 401s without it", async () => {
    expect((await list()).statusCode).toBe(200);
    const res = await list({});
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ api_id: expect.any(String) }); // Plivo-style body, not the Clerk one
  });

  it("rate limits per client+credential with HTTP 429 and a Plivo-style body", async () => {
    for (let i = 0; i < 3; i++) expect((await list()).statusCode).toBe(200);
    const res = await list();
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ api_id: expect.any(String), error: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run to verify it fails**, `npx vitest run src/routes/public-api/index.test.ts`.

- [ ] **Step 3: Implement `routes/public-api/index.ts`**

```ts
import type { FastifyPluginAsync } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { redisConnection } from "../../lib/queue.js";
import { newApiId } from "../../lib/public-api/responses.js";
import { publicApiAuth } from "./auth.js";
import { publicApiMessagesRouter } from "./messages.js";

/** Registered at prefix `/v1/Account/:authId`. Encapsulated: the rate limiter and auth hook apply only to these routes. */
export const publicApiRouter: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    max: () => Number(process.env["PUBLIC_API_RATE_LIMIT"] ?? 300),
    timeWindow: "1 minute",
    ...(redisConnection ? { redis: redisConnection } : {}),
    // Keyed by client IP AND credential id so a third party cannot exhaust a victim's bucket by guessing the id.
    keyGenerator: (req) => `pub:${req.ip}:${(req.params as { authId?: string }).authId ?? ""}`,
    errorResponseBuilder: () => ({ statusCode: 429, api_id: newApiId(), error: "Request was throttled." }),
  });
  fastify.addHook("preHandler", publicApiAuth);
  await fastify.register(publicApiMessagesRouter);
};
```
Typing note: `preHandler: publicApiAuth` is typed for `Params: { authId: string }`; if `tsc` complains, wrap: `fastify.addHook("preHandler", (req, reply) => publicApiAuth(req as never, reply))`.

- [ ] **Step 4: Run to verify it passes**, `npx vitest run src/routes/public-api/index.test.ts`. If the 429 body contains an unexpected `statusCode` key it is acceptable, but the HTTP status must be 429; if the status is not 429, set the status explicitly with `fastify.setErrorHandler` inside this plugin that maps `error.statusCode === 429` to `reply.status(429).send({ api_id: newApiId(), error: "Request was throttled." })`.

- [ ] **Step 5: Register the router behind the flag**

In `routes/index.ts` add `import { publicApiRouter } from "./public-api/index.js";` and at the end of `routes`:
```ts
  // Plivo-compatible public API: off unless PUBLIC_API_ENABLED=true (see docs/prd-plivo-compatible-api.md).
  if (process.env["PUBLIC_API_ENABLED"] === "true") {
    await fastify.register(publicApiRouter, { prefix: "/v1/Account/:authId" });
  }
```

- [ ] **Step 6: Start the workers behind the flag**

In `src/index.ts` add:
```ts
import { startPublicApiSendWorker } from "./workers/public-api-send.worker.js";
import { startPublicApiCallbackWorker } from "./workers/public-api-callbacks.worker.js";
```
and, after the AUTO_REGISTER_PHONE block inside `start()`:
```ts
  if (process.env["PUBLIC_API_ENABLED"] === "true") {
    startPublicApiSendWorker();
    startPublicApiCallbackWorker();
  }
```

- [ ] **Step 7: Document env vars**

Append to `.env.example`:
```
# Plivo-compatible public API (docs/prd-plivo-compatible-api.md)
PUBLIC_API_ENABLED=false
# 32 random bytes, base64 (openssl rand -base64 32). Encrypts API auth tokens at rest; losing it invalidates callback signing.
PUBLIC_API_TOKEN_KEY=
# Requests per minute per client IP + credential
PUBLIC_API_RATE_LIMIT=300
```

- [ ] **Step 8: Run the whole API suite and type-check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all new tests pass; only the 2 known flaky failures (segments/conversations) may fail. The impersonation route-classification test must pass (public routes are skipped by it; `/v1/api-credentials` is classified).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes/public-api/index.ts apps/api/src/routes/public-api/index.test.ts apps/api/src/routes/index.ts apps/api/src/index.ts .env.example
git commit -m "feat(public-api): register public plugin, rate limit and workers behind PUBLIC_API_ENABLED" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Security audit, end-to-end check, and release checklist

**Files:**
- Create: `apps/api/src/routes/public-api/e2e.test.ts` (in-process flow test)
- Modify: `docs/prd-plivo-compatible-api.md` (status line only)

- [ ] **Step 1: Audit every touched route for org scoping and RBAC (read the code, do not skim)**

For each, confirm and write the result into the final report:
- `routes/api-credentials.ts`: every `prisma.apiKey.*` call includes `organizationId`; sub-permission `settings_access@api_credentials`; `api_access` required; impersonation blocked via `BLOCKED_PREFIXES`.
- `routes/public-api/messages.ts`: `organizationId` only from `request.publicApi`; every query (`organization`, `vendorSetting`, `template`, `contact`, `conversation`, `message`, `apiMessageMeta`) is org-scoped; GET-by-uuid uses `{ messageId, organizationId }`.
- `workers/public-api-send.worker.ts`: lookup by `{ id, organizationId }`; Meta token read from DB, never from the job.
- `workers/public-api-callbacks.worker.ts`: credential row's `organizationId` must equal the job's.
- `routes/webhooks.ts` hook: forward is a no-op for messages without `api_message_meta`; dashboard behavior unchanged.
- Grep for secrets in logs: `git diff main -- apps/api/src | grep -nE "console\.(log|error)|log\.(info|error)"` and confirm no token, `tokenEnc`, `wabaAccessToken` or callback `fields` are logged.

- [ ] **Step 2: Write an in-process end-to-end test**

`e2e.test.ts` wires the real `publicApiRouter` + real `processSendJob` + real `deliverCallback` with mocked Prisma/WhatsApp/queues, and asserts the whole path:
1. `POST /Message/` returns 202 with a uuid and queues a send job and a `queued` callback job.
2. Feeding that send job to `processSendJob` (with `sendTextMessage` mocked to resolve) marks the message sent and queues a `sent` callback with `Sequence` 2.
3. Feeding the queued callback jobs to `deliverCallback` (with a fake `fetch`) produces requests whose `X-Plivo-Signature-V2` validates with the credential's token and whose body is form-encoded containing `MessageUUID` and `Status=queued` then `Status=sent`.
4. A revoked credential makes step 3 throw `UnrecoverableError`.
Keep Prisma mocks in-memory objects (a tiny `Map` per table) so the state transitions (`lastStatus`, `sequence`) are exercised for real.

Run: `npx vitest run src/routes/public-api/e2e.test.ts` and expect PASS.

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npx eslint src --ext .ts` (from `apps/api`).
Expected: type-check clean, only the 2 known flaky failures, lint clean for the new files.

- [ ] **Step 4: Release checklist (print in the final report, do not execute without confirmation)**

1. Generate `PUBLIC_API_TOKEN_KEY` (`openssl rand -base64 32`) and set it on Railway BEFORE enabling the flag; store a copy in the team password manager (losing it breaks callback signing for every credential).
2. Deploy with `PUBLIC_API_ENABLED=false` first: `start.sh` runs `prisma migrate deploy`, which applies `20261005000000_public_api`. If the DDL is ever applied out-of-band, run `prisma migrate resolve --applied 20261005000000_public_api` or the next deploy crash-loops (P3009).
3. Set `vendor_settings.plan_feature_api_access = "1"` for the client's org only (confirm before touching production data; dry-run any script).
4. Enable the flag, create the client's credential via `POST /v1/api-credentials` (admin), hand over `authId` + `authToken` once, and set its `callbackUrl`/`inboundUrl`.
5. Smoke test against the client's real WABA with a Meta test recipient; verify queued/sent/delivered callbacks and the signature using Plivo's own SDK validator.
6. Before announcing: get the client's samples (inbound webhook, interactive request, error body, success status code) and update the **[PROVISIONAL]** items (`plivoError` body, 202 vs other status, inbound fields, interactive list shape, time formats).
7. Verify against Meta's docs: every code in `meta-errors.ts`, and whether Meta's status webhook still carries `conversation` info for `ConversationID/Origin/Expiration`.

- [ ] **Step 5: Mark the PRD status and commit**

Change the `Status:` line of `docs/prd-plivo-compatible-api.md` to `Status: APPROVED 2026-10-05; Phase 1 implemented on branch feat/plivo-compatible-api (see docs/superpowers/plans/2026-10-05-plivo-compatible-api-phase1.md).`
```bash
git add apps/api/src/routes/public-api/e2e.test.ts docs/prd-plivo-compatible-api.md docs/superpowers/plans/2026-10-05-plivo-compatible-api-phase1.md
git commit -m "test(public-api): end-to-end flow test; update PRD status; add Phase 1 plan" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Finish the branch**

Use `superpowers:finishing-a-development-branch` and choose option 1 (merge locally). Do not push, and do not set `PUBLIC_API_ENABLED` anywhere without explicit confirmation.

---

## Self-Review (spec coverage)

| PRD requirement | Task |
|---|---|
| Credentials on `api_keys`, token shown once, hash + encrypted copy (Q7, Q9) | 1, 2, 6 |
| Basic auth, authId binding, revocation, org/plan gating | 5 |
| Credential management behind RBAC, impersonation-blocked, audited | 6 |
| `POST /Message/` text, media, template, location, interactive | 4, 7, 8, 9 |
| `GET /Message/`, `GET /Message/{uuid}/`, org-scoped | 11 |
| 24 h-window and other Meta failures mapped to Plivo error codes | 4, 9 |
| Silent contact/conversation creation (Q8) | 8 |
| Template lookup by name+language, ambiguity 400 (Q5) | 8 |
| Max 20 recipients (Q3), static pricing/carrier fields (Q4), undelivered mapping (Q6) | 7, 8, 10 |
| Status callbacks: form-encoded, V2 signed, 60/120/240 retry, SSRF-safe | 3, 8, 10 |
| Meta status forwarding for API messages only | 10 |
| Inbound forwarding (documented fields only until samples) | 12 |
| Rate limit per credential, flag, env docs | 13 |
| Impersonation guard test stays green | 6, 13 |
| Org-scoping security audit, e2e, release checklist | 14 |
| Templates API (Phase 2), WABA events (Phase 3), docs page | Out of scope: separate plans |

Type consistency check: `SendContentForWorker` (Task 8 `queues.ts`) is the worker input in Task 9; `enqueueStatusCallback(prisma, messageId, next, extra?)` signature is identical in Tasks 8, 9, 10; `CallbackJob.fields` is produced by `buildStatusFields`/`forwardInboundToApiClient` and consumed unchanged by `deliverCallback`; `plivoErrorFromMeta` returns `string | null` and is passed straight to `extra.errorCode`.
