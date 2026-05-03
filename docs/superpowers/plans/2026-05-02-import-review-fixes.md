# Import Feature Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all Critical, Important, and Minor issues identified in the CSV contact import feature code review.

**Architecture:** All fixes are self-contained. Backend changes live in `apps/api/src/routes/contacts-import.ts` and `apps/api/src/workers/contact-import.worker.ts`. Frontend changes are isolated to wizard step components. SSE auth uses a Node.js `crypto` HMAC token — no new dependencies required.

**Tech Stack:** Fastify 4 + ESM + Node 20, Next.js 15, BullMQ 5, PapaParse 5, Node.js `crypto` (built-in)

---

## File Map

| File | Changes |
|---|---|
| `apps/api/src/lib/phone-normalize.ts` | Fix E.164 minimum digit regex |
| `apps/api/src/workers/contact-import.worker.ts` | UnrecoverableError on missing session |
| `apps/api/src/routes/contacts-import.ts` | SSE HMAC token, non-blocking parse, session DELETE, upload field validation |
| `apps/web/app/(dashboard)/contacts/import/ImportWizard.tsx` | Add `importToken` to WizardState |
| `apps/web/app/(dashboard)/contacts/import/steps/Step1Upload.tsx` | Session cleanup before re-upload |
| `apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx` | Clear analysisResult on Back, fix validation message |
| `apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx` | Fix stale closure with useRef, pass token to SSE URL |
| `apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx` | Contextual message, secondary button |
| `apps/api/src/routes/contacts-import.test.ts` | Tests for analyze, start, worker fallback |

---

## Task 1: Fix E.164 Minimum Digit Threshold

**Files:**
- Modify: `apps/api/src/lib/phone-normalize.ts:2`

**Background:** The regex `{6,14}` allows 7-digit numbers like `+1234567` which are not valid WhatsApp-capable E.164 numbers. ITU-T E.164 minimum is 8 digits total.

- [ ] **Step 1: Change the regex**

In `apps/api/src/lib/phone-normalize.ts`, change line 2:

```typescript
// Before
return /^\+[1-9]\d{6,14}$/.test(value);

// After
return /^\+[1-9]\d{7,14}$/.test(value);
```

- [ ] **Step 2: Run existing tests to confirm they still pass**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all tests pass (existing test uses `+919000000001` which has 12 digits — well above the new minimum).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/phone-normalize.ts
git commit -m "fix(api): require minimum 8 digits for E.164 phone validation"
```

---

## Task 2: BullMQ UnrecoverableError on Missing Redis Session

**Files:**
- Modify: `apps/api/src/workers/contact-import.worker.ts:1,70-75`

**Background:** When the 30-min Redis TTL expires before the worker picks up the job, BullMQ retries the job 3 times (all will fail identically). The DB record also bounces between `"processing"` and `"failed"` on each attempt. `UnrecoverableError` signals BullMQ to skip retries immediately.

- [ ] **Step 1: Add UnrecoverableError import**

At the top of `apps/api/src/workers/contact-import.worker.ts`, change the bullmq import:

```typescript
// Before
import { Worker } from "bullmq";

// After
import { Worker, UnrecoverableError } from "bullmq";
```

- [ ] **Step 2: Replace the throw with UnrecoverableError + cleanup**

Find this block (around line 70-73):

```typescript
const csvText = await redis.get(`import:csv:${sessionId}`);
if (!csvText) throw new Error("CSV session data not found in Redis");
```

Replace with:

```typescript
const csvText = await redis.get(`import:csv:${sessionId}`);
if (!csvText) {
  await prisma.contactImport.update({
    where: { id: importId },
    data: { status: "failed", errorSummary: { message: "Upload session expired. Please re-upload the file." } as Prisma.InputJsonValue },
  });
  await redis.set(
    `import:progress:${importId}`,
    JSON.stringify({ status: "failed", processed: 0, total: 0, created: 0, updated: 0, skipped: 0 }),
    "EX", 7200
  );
  throw new UnrecoverableError("CSV session expired — no retries");
}
```

- [ ] **Step 3: Run type-check**

```bash
pnpm --filter @WBMSG/api type-check 2>&1 | grep "contact-import.worker"
```

Expected: no errors on the worker file (pre-existing `contactImport` TS errors on other lines are unrelated).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/contact-import.worker.ts
git commit -m "fix(api): use UnrecoverableError when CSV session expires to skip BullMQ retries"
```

---

## Task 3: SSE Auth via HMAC Token

**Background:** The SSE endpoint has no org-level isolation. The fix: on `/start`, generate an HMAC-SHA256 token encoding `importJobId`, `organizationId`, and an expiry. The frontend passes it as `?token=` on the SSE URL. The SSE endpoint verifies the signature and expiry before streaming.

No new dependencies — uses Node.js built-in `crypto`.

**Files:**
- Modify: `apps/api/src/routes/contacts-import.ts`
- Modify: `apps/web/app/(dashboard)/contacts/import/ImportWizard.tsx`
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx`

- [ ] **Step 1: Add HMAC helpers to contacts-import.ts**

At the top of `apps/api/src/routes/contacts-import.ts`, add the `crypto` import and two helper functions after the existing imports:

```typescript
import { createHmac, timingSafeEqual } from "crypto";
```

Then add these two helpers just before `export const contactsImportRouter`:

```typescript
function generateImportToken(importJobId: string, organizationId: string): string {
  const secret = process.env["IMPORT_TOKEN_SECRET"] ?? "dev-import-secret-change-in-prod";
  const exp = Math.floor(Date.now() / 1000) + 1800;
  const payload = `${importJobId}:${organizationId}:${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}:${sig}`;
}

function verifyImportToken(token: string, expectedJobId: string): string | null {
  const parts = token.split(":");
  if (parts.length !== 4) return null;
  const [jobId, orgId, expStr, sig] = parts as [string, string, string, string];
  if (jobId !== expectedJobId) return null;
  const exp = parseInt(expStr, 10);
  if (isNaN(exp) || Math.floor(Date.now() / 1000) > exp) return null;
  const secret = process.env["IMPORT_TOKEN_SECRET"] ?? "dev-import-secret-change-in-prod";
  const payload = `${jobId}:${orgId}:${expStr}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
  } catch {
    return null;
  }
  return orgId;
}
```

- [ ] **Step 2: Return token from /start endpoint**

In the `/start` handler, find the final `return reply.send(...)` line:

```typescript
// Before
return reply.send({ data: { importJobId: importRecord.id as ContactImportId } });

// After
const importToken = generateImportToken(importRecord.id, organizationId);
return reply.send({ data: { importJobId: importRecord.id as ContactImportId, importToken } });
```

- [ ] **Step 3: Verify token in SSE handler**

Find the SSE handler. Change its type signature to include `Querystring` and add verification at the top of the handler:

```typescript
// Change:
fastify.get<{ Params: { jobId: string } }>(
  "/contacts/import/:jobId/progress",
  (request, reply) => {
    const { jobId } = request.params;

    reply.hijack();
// To:
fastify.get<{ Params: { jobId: string }; Querystring: { token?: string } }>(
  "/contacts/import/:jobId/progress",
  (request, reply) => {
    const { jobId } = request.params;
    const { token } = request.query;

    if (!token) {
      reply.status(401).send({ error: { code: "MISSING_TOKEN", message: "Missing import token" } });
      return;
    }
    const orgId = verifyImportToken(token, jobId);
    if (!orgId) {
      reply.status(401).send({ error: { code: "INVALID_TOKEN", message: "Invalid or expired import token" } });
      return;
    }

    reply.hijack();
```

- [ ] **Step 4: Add importToken to WizardState**

In `apps/web/app/(dashboard)/contacts/import/ImportWizard.tsx`, add `importToken` to the interface and initial state:

```typescript
// In WizardState interface, add after importJobId line:
importToken: string | null;

// In INITIAL_STATE, add after importJobId line:
importToken: null,
```

- [ ] **Step 5: Store token in wizard state after /start**

In `apps/web/app/(dashboard)/contacts/import/steps/Step3Preview.tsx`, update the setState call after a successful `/start` response:

```typescript
// Before
const body = await res.json() as { data: { importJobId: string } };
setState({ importJobId: body.data.importJobId });

// After
const body = await res.json() as { data: { importJobId: string; importToken: string } };
setState({ importJobId: body.data.importJobId, importToken: body.data.importToken });
```

- [ ] **Step 6: Use token in SSE URL**

In `apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx`, update the `connect` function:

```typescript
// Before
es = new EventSource(
  `${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/${state.importJobId}/progress`
);

// After
es = new EventSource(
  `${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/${state.importJobId}/progress?token=${encodeURIComponent(state.importToken ?? "")}`
);
```

- [ ] **Step 7: Run type-check on both apps**

```bash
pnpm --filter @WBMSG/api type-check 2>&1 | grep -v "contactImport"
pnpm --filter @WBMSG/web type-check 2>&1
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/contacts-import.ts apps/web/app/\(dashboard\)/contacts/import/ImportWizard.tsx apps/web/app/\(dashboard\)/contacts/import/steps/Step3Preview.tsx apps/web/app/\(dashboard\)/contacts/import/steps/Step4Progress.tsx
git commit -m "feat(api): add HMAC token auth to SSE import progress endpoint"
```

---

## Task 4: Fix Stale Progress Closure in Step 4

**Background:** The `done` event handler in Step4Progress closes over the `progress` React state variable, which may be one tick behind the latest update. A `useRef` that mirrors every state update gives the `done` handler access to the true final values.

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx`

- [ ] **Step 1: Add useRef import and ref declaration**

Change the import line:

```typescript
// Before
import { JSX, useEffect, useState } from "react";

// After
import { JSX, useEffect, useRef, useState } from "react";
```

Add the ref just after the `useState` calls (after line declaring `const [failed, setFailed]`):

```typescript
const latestProgressRef = useRef(progress);
```

- [ ] **Step 2: Mirror state updates into the ref**

Change the `setProgress` call inside `es.onmessage`:

```typescript
// Before
setProgress((prev) => ({ ...prev, ...data }));

// After
setProgress((prev) => {
  const next = { ...prev, ...data } as ImportProgress;
  latestProgressRef.current = next;
  return next;
});
```

- [ ] **Step 3: Use ref in the done handler**

Change the `setState` call inside the `data.event === "done"` branch:

```typescript
// Before
setState({ importSummary: { ...progress, status: "completed" } });

// After
setState({ importSummary: { ...latestProgressRef.current, status: "completed" } });
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @WBMSG/web type-check 2>&1
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(dashboard\)/contacts/import/steps/Step4Progress.tsx
git commit -m "fix(web): use useRef to capture latest progress in SSE done handler"
```

---

## Task 5: Non-Blocking CSV Parse in /analyze

**Background:** `Papa.parse` on a full 50 MB CSV string blocks the Node.js event loop for seconds. Using PapaParse's `step` callback with `pause()`/`resume()` via `setImmediate` yields the event loop every 500 rows.

**Files:**
- Modify: `apps/api/src/routes/contacts-import.ts`

- [ ] **Step 1: Add a streaming parse helper**

Add this helper function to `contacts-import.ts` just before `export const contactsImportRouter`:

```typescript
function streamParseCSV(csvText: string): Promise<Array<Record<string, string>>> {
  return new Promise((resolve, reject) => {
    const rows: Array<Record<string, string>> = [];
    let chunk: Array<Record<string, string>> = [];

    Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      step: (result, parser) => {
        chunk.push(result.data);
        if (chunk.length >= 500) {
          rows.push(...chunk);
          chunk = [];
          parser.pause();
          setImmediate(() => parser.resume());
        }
      },
      complete: () => {
        rows.push(...chunk);
        resolve(rows);
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}
```

- [ ] **Step 2: Use streamParseCSV in /analyze**

In the `/analyze` handler, replace the synchronous `Papa.parse` block:

```typescript
// Before
const parsed = Papa.parse<Record<string, string>>(csvText, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => h.trim(),
});

const fullPhoneEntry = fieldMapping.find((e) => e.dbField === "fullPhoneNumber");
// ... rest of loop using parsed.data
for (const row of parsed.data) {
```

```typescript
// After
const rows = await streamParseCSV(csvText);

const fullPhoneEntry = fieldMapping.find((e) => e.dbField === "fullPhoneNumber");
// ... rest of loop using rows
for (const row of rows) {
```

Also update the `totalRows` line at the end:

```typescript
// Before
totalRows: parsed.data.length,

// After
totalRows: rows.length,
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @WBMSG/api type-check 2>&1 | grep "contacts-import"
```

Expected: no new errors on this file.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/contacts-import.ts
git commit -m "fix(api): use streaming PapaParse in /analyze to avoid blocking event loop"
```

---

## Task 6: Clear analysisResult When Going Back from Step 2

**Background:** If a user reaches Step 3, clicks Back to Step 2, then Back to Step 1 and re-uploads a new file, `state.analysisResult` will still hold data from the first upload. The `prevStep` call from Step 2 should clear it.

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx`

- [ ] **Step 1: Replace inline prevStep call with a handleBack function**

Find the Back button in `Step2MapFields.tsx`:

```tsx
// Before
<Button variant="secondary" onClick={prevStep} disabled={loading}>Back</Button>

// After
<Button variant="secondary" onClick={() => { setState({ analysisResult: null }); prevStep(); }} disabled={loading}>Back</Button>
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check 2>&1
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/contacts/import/steps/Step2MapFields.tsx
git commit -m "fix(web): clear analysisResult when navigating back from Step 2"
```

---

## Task 7: Clean Up Orphaned Redis Sessions on Re-Upload

**Background:** When a user drops a second CSV on Step 1 (after already uploading one), the old `import:csv:<sessionId>` key stays in Redis until its 30-min TTL expires. A dedicated DELETE endpoint lets the frontend clean up eagerly.

**Files:**
- Modify: `apps/api/src/routes/contacts-import.ts`
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step1Upload.tsx`

- [ ] **Step 1: Add DELETE /v1/contacts/import/session/:sessionId route**

Add this route inside `contactsImportRouter`, just before the SSE handler:

```typescript
fastify.delete<{ Params: { sessionId: string } }>(
  "/contacts/import/session/:sessionId",
  async (request, reply) => {
    const { sessionId } = request.params;
    await redis.del(`import:csv:${sessionId}`);
    return reply.status(204).send();
  }
);
```

- [ ] **Step 2: Call DELETE before re-uploading in Step1Upload**

In `apps/web/app/(dashboard)/contacts/import/steps/Step1Upload.tsx`, at the top of `handleFile`, after the size/extension checks and before calling the upload API, add a cleanup call:

```typescript
// Add this block just before setUploading(true):
if (state.sessionId) {
  const token = await getToken();
  await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/session/${state.sessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token ?? ""}` },
  }).catch(() => undefined); // best-effort, don't block on failure
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @WBMSG/api type-check 2>&1 | grep "contacts-import"
pnpm --filter @WBMSG/web type-check 2>&1
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/contacts-import.ts apps/web/app/\(dashboard\)/contacts/import/steps/Step1Upload.tsx
git commit -m "fix: eagerly clean up Redis session when user re-uploads a CSV"
```

---

## Task 8: Fix Step 2 Validation Message and Upload Field Name Check

**Background:** When `fullPhoneNumber` AND `phoneNumber` (without `countryCode`) are mapped, the error "Country Code required..." is technically correct but confusing — the user doesn't know they should either add CC or remove the phone number mapping. Also, the `/upload` endpoint doesn't validate that the field name is `"file"`.

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx`
- Modify: `apps/api/src/routes/contacts-import.ts`

- [ ] **Step 1: Improve validation message in Step2MapFields**

In `validateMapping`, replace the two pairwise checks with messages that clarify the full context:

```typescript
// Before
if (hasPhone && !hasCC) return "Country Code column is required when Phone Number is mapped.";
if (hasCC && !hasPhone) return "Phone Number column is required when Country Code is mapped.";

// After
if (hasPhone && !hasCC) {
  return hasFull
    ? "Remove the Phone Number mapping (Full Phone Number covers it) or also map Country Code."
    : "Country Code column is required when Phone Number is mapped.";
}
if (hasCC && !hasPhone) {
  return hasFull
    ? "Remove the Country Code mapping (Full Phone Number covers it) or also map Phone Number."
    : "Phone Number column is required when Country Code is mapped.";
}
```

- [ ] **Step 2: Validate field name in /upload**

In `contacts-import.ts`, in the `/upload` handler, add a field name check after `const file = await ...file()`:

```typescript
// Add after the null check on `file`:
const fileWithName = file as unknown as { fieldname: string; toBuffer: () => Promise<Buffer> };
if (fileWithName.fieldname !== "file") {
  return reply.status(400).send({ error: { code: "INVALID_FIELD", message: "File must be sent in a field named 'file'" } });
}
const buffer = await fileWithName.toBuffer();
```

And remove the original `const buffer = await file.toBuffer();` line that follows (it's replaced above).

- [ ] **Step 3: Type-check both apps**

```bash
pnpm --filter @WBMSG/api type-check 2>&1 | grep "contacts-import"
pnpm --filter @WBMSG/web type-check 2>&1
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/contacts/import/steps/Step2MapFields.tsx apps/api/src/routes/contacts-import.ts
git commit -m "fix: improve Step 2 validation messages and validate upload field name"
```

---

## Task 9: Step 5 UX Polish

**Background:** Step 5 says "imported successfully" even when 0 contacts were created or updated (e.g. all rows had invalid phones). "Import Another File" is a secondary action but uses the primary button style.

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx`

- [ ] **Step 1: Add contextual subtitle and fix button variant**

Replace the entire Step5Summary component body:

```tsx
export function Step5Summary(): JSX.Element {
  const { state, reset } = useWizard();
  const router = useRouter();

  const summary = state.importSummary;
  const totalActioned = (summary?.created ?? 0) + (summary?.updated ?? 0);
  const allSkipped = totalActioned === 0;

  return (
    <div className="space-y-6 text-center py-2">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${allSkipped ? "bg-amber-100" : "bg-green-100"}`}>
        <span className={`text-2xl font-bold ${allSkipped ? "text-amber-600" : "text-green-600"}`}>
          {allSkipped ? "!" : "✓"}
        </span>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-900">Import complete</h2>
        <p className="text-sm text-gray-500 mt-1">
          {allSkipped
            ? "No contacts were imported — all rows were skipped or had invalid phone numbers."
            : "Your contacts have been imported successfully."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-lg border border-gray-100 bg-green-50 p-4">
          <p className="text-2xl font-bold text-green-700">{(summary?.created ?? 0).toLocaleString()}</p>
          <p className="text-gray-500 mt-0.5">Created</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-blue-50 p-4">
          <p className="text-2xl font-bold text-blue-700">{(summary?.updated ?? 0).toLocaleString()}</p>
          <p className="text-gray-500 mt-0.5">Updated</p>
        </div>
        <div className="rounded-lg border border-gray-100 p-4">
          <p className="text-2xl font-bold text-gray-400">{(summary?.skipped ?? 0).toLocaleString()}</p>
          <p className="text-gray-500 mt-0.5">Skipped</p>
        </div>
      </div>

      <div className="flex justify-center gap-3 pt-2">
        <Button onClick={() => router.push("/contacts")}>View Contacts</Button>
        <Button variant="secondary" onClick={reset}>Import Another File</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check 2>&1
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/contacts/import/steps/Step5Summary.tsx
git commit -m "fix(web): show contextual message when all rows skipped on Step 5"
```

---

## Task 10: Add Tests for analyze, start, and dual-phone fallback

**Background:** Only 2 tests exist for the upload route. The review identified missing coverage for `/analyze`, `/start`, session expiry, and the per-row dual-phone fallback.

**Files:**
- Modify: `apps/api/src/routes/contacts-import.test.ts`

- [ ] **Step 1: Add /analyze tests**

Append the following describe block to `contacts-import.test.ts`:

```typescript
describe("POST /v1/contacts/import/analyze", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  const SESSION_ID = "test-session-id";

  it("returns 404 when session not found in Redis", async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/analyze",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ sessionId: SESSION_ID, fieldMapping: [{ csvColumn: "Phone", dbField: "fullPhoneNumber" }] }),
    });
    expect(res.statusCode).toBe(404);
  });

  it("counts unique phones, duplicates, and existing contacts", async () => {
    const csv = "Full Phone\n+919000000001\n+919000000002\n+919000000001"; // 3 rows, 1 duplicate, 2 unique
    mockRedisGet.mockResolvedValueOnce(csv);
    mockPrisma.contact.findMany.mockResolvedValueOnce([{ phoneNumber: "+919000000001" }]); // 1 existing

    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/analyze",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        sessionId: SESSION_ID,
        fieldMapping: [{ csvColumn: "Full Phone", dbField: "fullPhoneNumber" }],
      }),
    });

    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { totalRows: number; newContacts: number; duplicatesInCsv: number; existingInDb: number } }>().data;
    expect(data.totalRows).toBe(3);
    expect(data.duplicatesInCsv).toBe(1);
    expect(data.existingInDb).toBe(1);
    expect(data.newContacts).toBe(1); // +919000000002 is new
  });

  it("falls back from fullPhone to splitPhone when fullPhone cell is empty", async () => {
    // Row 1: has fullPhone; Row 2: fullPhone empty, has phone+cc
    const csv = "Full Phone,Phone Number,Country Code\n+919000000001,,\n,9000000002,91";
    mockRedisGet.mockResolvedValueOnce(csv);
    mockPrisma.contact.findMany.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/analyze",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        sessionId: SESSION_ID,
        fieldMapping: [
          { csvColumn: "Full Phone", dbField: "fullPhoneNumber" },
          { csvColumn: "Phone Number", dbField: "phoneNumber" },
          { csvColumn: "Country Code", dbField: "countryCode" },
        ],
      }),
    });

    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { totalRows: number; newContacts: number } }>().data;
    expect(data.totalRows).toBe(2);
    expect(data.newContacts).toBe(2); // both rows resolved to valid phones
  });

  it("skips rows where both fullPhone and splitPhone are invalid", async () => {
    const csv = "Full Phone,Phone Number,Country Code\nbadvalue,,\n,badphone,badcc";
    mockRedisGet.mockResolvedValueOnce(csv);
    mockPrisma.contact.findMany.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/analyze",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        sessionId: SESSION_ID,
        fieldMapping: [
          { csvColumn: "Full Phone", dbField: "fullPhoneNumber" },
          { csvColumn: "Phone Number", dbField: "phoneNumber" },
          { csvColumn: "Country Code", dbField: "countryCode" },
        ],
      }),
    });

    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { newContacts: number } }>().data;
    expect(data.newContacts).toBe(0);
  });
});

describe("POST /v1/contacts/import/start", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a DB record and enqueues a BullMQ job", async () => {
    const { contactImportQueue } = await import("../lib/queue.js");
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/start",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        sessionId: "sess-1",
        fieldMapping: [{ csvColumn: "Phone", dbField: "fullPhoneNumber" }],
        batchTags: ["vip"],
        lifecycleStage: "lead",
        updateExisting: false,
        totalRows: 100,
      }),
    });

    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { importJobId: string; importToken: string } }>().data;
    expect(data.importJobId).toBe("import-1");
    expect(data.importToken).toBeTruthy();
    expect(data.importToken).toContain("import-1");
    expect(mockPrisma.contactImport.create).toHaveBeenCalledOnce();
    expect(vi.mocked(contactImportQueue.add)).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @WBMSG/api test 2>&1
```

Expected: all tests pass including the 6 new ones.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/contacts-import.test.ts
git commit -m "test(api): add coverage for analyze, start, and dual-phone fallback"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| E.164 minimum 8 digits | Task 1 |
| UnrecoverableError on session expiry | Task 2 |
| SSE org-level isolation via HMAC token | Task 3 |
| Step 4 correct final summary counts | Task 4 |
| Non-blocking CSV parse | Task 5 |
| Back clears stale analysisResult | Task 6 |
| Redis session cleanup on re-upload | Task 7 |
| Better validation messages | Task 8 |
| Upload field name validation | Task 8 |
| Step 5 zero-contact message | Task 9 |
| Secondary button variant | Task 9 |
| Test coverage | Task 10 |

All 12 review issues are covered. No placeholders. Type names are consistent throughout.
