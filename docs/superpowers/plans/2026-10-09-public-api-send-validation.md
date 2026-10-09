# Public API Send Validation + Named Template Parameters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `POST /v1/Account/:authId/Message/` accept `parameter_name` on template text parameters and reject bad input with a clear 400 before anything is queued or sent to Meta.

**Architecture:** Pure validation/mapping changes in `apps/api/src/lib/public-api/` (`send-mapping.ts` plus a new `template-validation.ts`), wired into the existing template branch of `routes/public-api/messages.ts`. No schema change, no migration, no new endpoint. Existing positional sends keep working.

**Tech Stack:** TypeScript, Fastify, Prisma 7 (`@prisma/client`), Vitest.

**Spec:** `docs/prd-public-api-request-payload-logging.md` (Part A and Part A2). Part B (payload logging) is a separate plan: `docs/superpowers/plans/2026-10-09-public-api-payload-logging.md`.

## Global Constraints

- Org scoping: the template lookup stays `where: { organizationId, name }` (never cross-org). No other route is touched.
- Error shape unchanged: validation failures throw `SendValidationError`, which `messages.ts:76` turns into `plivoError(reply, 400, message)`.
- Messages must be safe: never echo request text values or phone numbers beyond what today's `Invalid destination number: <part>` already does.
- Positional templates and existing valid requests must behave exactly as before, except where a task below says otherwise.
- Owner decisions (2026-10-09): reject letters/symbols in phone strings; specific template-lookup messages; callback `method` must be GET or POST; validate BODY and HEADER parameters only (button parameters keep today's checks); do NOT enforce the newline/tab/4-spaces rule (unverified against Meta).
- Do not use the word "Plivo" in any customer-facing error text.
- Tests run with: `cd apps/api && pnpm vitest run <path>`.

## Review Focus

- Request has a body param but the template has none, or sends no components at all for a template with variables: 400 "template parameters not matched", not a Meta failure.
- Named template, parameters sent in a different order than the template: must be accepted (Meta allows any order).
- Named template, same `parameter_name` sent twice, or an unknown name: 400.
- Positional template with `parameter_name` supplied: 400 (do not silently drop).
- Phone string with letters (`abc14155552672xyz`), `+`-prefixed and spaced numbers (`+1 415 555 2672`): letters rejected, spaced accepted.
- Template exists in another language (`en` sent, `en_US` stored) or is not approved: message names the available languages / the status.

---

## File Structure

- Modify `apps/api/src/lib/public-api/send-mapping.ts`: parameter shape, parameter-level checks, phone/name/language/method checks, named preview rendering, pass-through of `parameter_name`.
- Modify `apps/api/src/lib/whatsapp.ts:113-126`: `WaTemplateComponent.parameters[]` gets `parameter_name?: string`.
- Create `apps/api/src/lib/public-api/template-validation.ts`: `resolveTemplate`, `validateAgainstTemplate`, `placeholders` (pure, no DB).
- Create `apps/api/src/lib/public-api/template-validation.test.ts`.
- Modify `apps/api/src/lib/public-api/send-mapping.test.ts`.
- Modify `apps/api/src/routes/public-api/messages.ts:100-121` and `messages.test.ts:111-122`.
- Modify `docs/api/wbmsg-api-client-guide.md` and `.html`, and `docs/api/WBMSG-WhatsApp-API.postman_collection.json`.

---

### Task 1: `parameter_name` pass-through and parameter-level checks

**Files:**
- Modify: `apps/api/src/lib/public-api/send-mapping.ts:9-14,119-158,160-182,260-275`
- Modify: `apps/api/src/lib/whatsapp.ts:117-124`
- Test: `apps/api/src/lib/public-api/send-mapping.test.ts`

**Interfaces:**
- Produces: `PlivoTemplateComponent.parameters[]` items may carry `parameter_name?: string`; `toMetaTemplateComponents` emits `{ type: "text", text, parameter_name }` when present; `renderTemplateForInbox` resolves `{{name}}` placeholders.

- [ ] **Step 1: Write the failing tests** (append inside `send-mapping.test.ts`; `cast` and `mapT` already exist near line 122)

```ts
describe("named template parameters", () => {
  it("passes parameter_name through to the Meta component", () => {
    const out = toMetaTemplateComponents(cast([
      { type: "body", parameters: [{ type: "text", parameter_name: "username", text: "Alex" }, { type: "text", parameter_name: "order_id", text: "WB-1001" }] },
    ]), null);
    expect(out).toEqual([{ type: "body", parameters: [
      { type: "text", text: "Alex", parameter_name: "username" },
      { type: "text", text: "WB-1001", parameter_name: "order_id" },
    ] }]);
  });

  it("leaves positional parameters without a parameter_name key", () => {
    const out = toMetaTemplateComponents(cast([{ type: "body", parameters: [{ type: "text", text: "Ann" }] }]), null);
    expect(out[0]!.parameters![0]).toEqual({ type: "text", text: "Ann" });
  });

  it.each([
    ["parameter_name not a string", [{ type: "body", parameters: [{ type: "text", text: "a", parameter_name: 5 }] }]],
    ["parameter_name with spaces", [{ type: "body", parameters: [{ type: "text", text: "a", parameter_name: "user name" }] }]],
    ["parameter_name too long", [{ type: "body", parameters: [{ type: "text", text: "a", parameter_name: "a".repeat(65) }] }]],
    ["empty text value", [{ type: "body", parameters: [{ type: "text", text: "" }] }]],
    ["whitespace-only text value", [{ type: "body", parameters: [{ type: "text", text: "   " }] }]],
    ["two body components", [{ type: "body", parameters: [] }, { type: "body", parameters: [] }]],
    ["two header components", [{ type: "header", parameters: [] }, { type: "header", parameters: [] }]],
  ])("rejects %s", (_n, comps) => { expect(mapT(comps)).toThrow(SendValidationError); });

  it("allows several button components", () => {
    expect(mapT([
      { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: "a" }] },
      { type: "button", sub_type: "url", index: 1, parameters: [{ type: "text", text: "b" }] },
    ])).not.toThrow();
  });

  it("renderTemplateForInbox fills named placeholders by parameter_name, in any order", () => {
    const stored = [{ type: "BODY", text: "Hi {{username}}, approved by {{order_id}}" }];
    const json = renderTemplateForInbox("t", stored, cast([
      { type: "body", parameters: [{ type: "text", parameter_name: "order_id", text: "WB-1001" }, { type: "text", parameter_name: "username", text: "Alex" }] },
    ]));
    expect(JSON.parse(json).body).toBe("Hi Alex, approved by WB-1001");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/send-mapping.test.ts -t "named template parameters"`
Expected: FAIL (parameter_name is dropped; no rejection of empty text / duplicate body).

- [ ] **Step 3: Implement**

In `send-mapping.ts` change the interface (line 13):

```ts
  parameters?: Array<{ type: string; text?: string; media?: string; payload?: string; parameter_name?: string }>;
```

Replace the `text` branch inside `validateComponents` (currently lines 129-132) with:

```ts
      if (p["type"] === "text") {
        if (typeof p["text"] !== "string") return bad(`${at}.text must be a string`);
        if (p["text"].trim() === "") return bad(`${at}.text must not be empty`);
        const pn = p["parameter_name"];
        if (pn !== undefined) {
          if (typeof pn !== "string" || !/^[A-Za-z0-9_]{1,64}$/.test(pn)) return bad(`${at}.parameter_name must be 1-64 letters, digits or underscores`);
          return { type: "text", text: p["text"], parameter_name: pn };
        }
        return { type: "text", text: p["text"] };
      }
```

At the end of `validateComponents`, change `return raw.map(...)` into a variable and add the duplicate check. Replace `return raw.map((c: unknown, ci): PlivoTemplateComponent => {` with `const out = raw.map((c: unknown, ci): PlivoTemplateComponent => {`, and after the closing `});` of the map add:

```ts
  for (const t of ["header", "body"]) {
    if (out.filter((c) => c.type.toLowerCase() === t).length > 1) return bad(`template.components has more than one ${t} component`);
  }
  return out;
```

In `toMetaTemplateComponents`, replace the last line of the parameter map (`return { type: "text", text: p.text as string };`) with:

```ts
      return { type: "text", text: p.text as string, ...(p.parameter_name ? { parameter_name: p.parameter_name } : {}) };
```

Replace the placeholder line in `renderTemplateForInbox` (line 265) with:

```ts
  body = body.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    if (/^\d+$/.test(key)) return bodyParams[Number(key) - 1]?.text ?? "";
    return bodyParams.find((p) => p.parameter_name === key)?.text ?? "";
  });
```

In `whatsapp.ts` add to the parameter object in `WaTemplateComponent` (after `payload?: string;`):

```ts
    parameter_name?: string;
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/send-mapping.test.ts`
Expected: PASS (all existing tests too).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/public-api/send-mapping.ts apps/api/src/lib/whatsapp.ts apps/api/src/lib/public-api/send-mapping.test.ts
git commit -m "feat(api): pass parameter_name through for named template parameters"
```

---

### Task 2: Phone, template name, language, callback method and URL checks

**Files:**
- Modify: `apps/api/src/lib/public-api/send-mapping.ts:56-90`
- Test: `apps/api/src/lib/public-api/send-mapping.test.ts`

**Interfaces:**
- Produces: `parseSendBody` throws `SendValidationError` for the new cases below; `ParsedSend` shape unchanged.

- [ ] **Step 1: Write the failing tests** (append to the `parseSendBody` describe block's file; `base` and `bad` exist at the top)

```ts
describe("parseSendBody: strict input checks", () => {
  it.each([
    ["letters around src", { src: "abc14155552671xyz" }],
    ["letters in dst", { dst: "abc14155552672xyz" }],
    ["symbols in dst", { dst: "+14155552672#1" }],
    ["letters in a second dst", { dst: "+14155552672<4155x50000" }],
  ])("rejects phone strings with %s", (_n, over) => { bad({ ...base, ...over, text: "x" }); });

  it("accepts +, spaces, dashes and parentheses in phone numbers", () => {
    const p = parseSendBody({ ...base, src: "+1 (415) 555-2671", dst: "+1 415-555-2672", text: "x" });
    expect(p.src).toBe("14155552671");
    expect(p.dsts).toEqual(["14155552672"]);
  });

  it.each([["UPPER"], ["has space"], ["has-dash"], [""], ["a".repeat(513)]])("rejects template name %j", (name) => {
    bad({ ...base, template: { name, language: "en" } });
  });
  it.each([["english"], ["EN"], ["en-US"], ["e"], ["en_us_x"]])("rejects template language %j", (language) => {
    bad({ ...base, template: { name: "t", language } });
  });
  it.each([["en"], ["en_US"], ["pt_BR"], ["fil"], ["zh_CN"]])("accepts template language %j", (language) => {
    expect(() => parseSendBody({ ...base, template: { name: "t", language } })).not.toThrow();
  });

  it("rejects a callback method other than GET or POST, accepts either case", () => {
    bad({ ...base, text: "x", method: "PUT" });
    expect(parseSendBody({ ...base, text: "x", method: "get" }).callbackMethod).toBe("GET");
    expect(parseSendBody({ ...base, text: "x" }).callbackMethod).toBe("POST");
  });
  it("rejects a callback url over 2000 characters", () => {
    bad({ ...base, text: "x", url: "https://c.example.com/" + "a".repeat(2000) });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/send-mapping.test.ts -t "strict input checks"`
Expected: FAIL.

- [ ] **Step 3: Implement** in `send-mapping.ts`

Below `str` (line 46) add:

```ts
const PHONE_CHARS = /^\+?[0-9 ()-]+$/;
const TEMPLATE_NAME = /^[a-z0-9_]{1,512}$/;
const TEMPLATE_LANG = /^[a-z]{2,3}(_[A-Za-z]{2,4})?$/;
const MAX_CALLBACK_URL = 2000;
```

Replace the `src` handling (lines 60-61) with:

```ts
  const srcRaw = str(body["src"]) ?? "";
  if (srcRaw && !PHONE_CHARS.test(srcRaw)) throw new SendValidationError("src contains invalid characters");
  const src = normalizeFullPhone(srcRaw);
  if (!src) throw new SendValidationError("src must be a valid WhatsApp Business number");
```

In the dst loop, before `normalizeFullPhone(part.trim())`, add:

```ts
    if (part.trim() && !PHONE_CHARS.test(part.trim())) throw new SendValidationError(`Invalid destination number: ${part.trim()}`);
```

Replace the callback lines (73-74) with:

```ts
  const callbackUrl = str(body["url"]);
  if (callbackUrl && callbackUrl.length > MAX_CALLBACK_URL) throw new SendValidationError(`url must be at most ${MAX_CALLBACK_URL} characters`);
  const methodRaw = body["method"] == null ? "POST" : String(body["method"]).toUpperCase();
  if (methodRaw !== "GET" && methodRaw !== "POST") throw new SendValidationError("method must be GET or POST");
  const callbackMethod: "GET" | "POST" = methodRaw;
```

Replace the template name/language check (line 89) with:

```ts
    if (!name || !language) throw new SendValidationError("template.name and template.language are required");
    if (!TEMPLATE_NAME.test(name)) throw new SendValidationError("template.name may contain only lowercase letters, digits and underscores (max 512)");
    if (!TEMPLATE_LANG.test(language)) throw new SendValidationError("template.language must look like en or en_US");
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/send-mapping.test.ts`
Expected: PASS. If an older test used an uppercase template name or `method: "PUT"`, update that test's fixture (the new rule is intended).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/public-api/send-mapping.ts apps/api/src/lib/public-api/send-mapping.test.ts
git commit -m "feat(api): strict phone, template name, language and callback method validation"
```

---

### Task 3: Template-aware validation module

**Files:**
- Create: `apps/api/src/lib/public-api/template-validation.ts`
- Test: `apps/api/src/lib/public-api/template-validation.test.ts`

**Interfaces:**
- Consumes: `SendValidationError`, `PlivoTemplateComponent` from `./send-mapping.js` (Task 1 shape).
- Produces:
  - `interface TemplateRow { name: string; language: string; status: string; components: unknown; parameterFormat: string | null }`
  - `placeholders(text: string | undefined): string[]`
  - `resolveTemplate(rows: TemplateRow[], name: string, language: string): TemplateRow`
  - `validateAgainstTemplate(row: TemplateRow, components: PlivoTemplateComponent[]): void`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { SendValidationError, type PlivoTemplateComponent } from "./send-mapping.js";
import { placeholders, resolveTemplate, validateAgainstTemplate, type TemplateRow } from "./template-validation.js";

const row = (over: Partial<TemplateRow> = {}): TemplateRow => ({
  name: "kyc", language: "en", status: "approved", parameterFormat: "NAMED",
  components: [{ type: "BODY", text: "Hi {{username}}, approved by {{order_id}}" }], ...over,
});
const t = (n: string, v = "x") => ({ type: "text", parameter_name: n, text: v });
const body = (...parameters: object[]) => [{ type: "body", parameters }] as PlivoTemplateComponent[];
const fails = (r: TemplateRow, c: PlivoTemplateComponent[], msg: RegExp) => expect(() => validateAgainstTemplate(r, c)).toThrow(msg);

describe("placeholders", () => {
  it("extracts unique names and numbers in order", () => {
    expect(placeholders("a {{x}} b {{ y }} c {{x}}")).toEqual(["x", "y"]);
    expect(placeholders("{{1}} {{2}}")).toEqual(["1", "2"]);
    expect(placeholders(undefined)).toEqual([]);
  });
});

describe("resolveTemplate", () => {
  const rows = [row({ language: "en_US" }), row({ language: "hi", status: "pending" })];
  it("returns the approved row for the exact language", () => { expect(resolveTemplate(rows, "kyc", "en_US").language).toBe("en_US"); });
  it("not found when there are no rows", () => { expect(() => resolveTemplate([], "kyc", "en")).toThrow(/Template "kyc" not found/); });
  it("lists available languages when the language does not exist", () => {
    expect(() => resolveTemplate(rows, "kyc", "en")).toThrow(/no language "en"; available: en_US, hi/);
  });
  it("names the status when the language exists but is not approved", () => {
    expect(() => resolveTemplate(rows, "kyc", "hi")).toThrow(/not approved \(status: pending\)/);
  });
  it("rejects two approved rows for the same name and language", () => {
    expect(() => resolveTemplate([row(), row()], "kyc", "en")).toThrow(/more than one template/);
  });
});

describe("validateAgainstTemplate: named", () => {
  it("accepts any order", () => { expect(() => validateAgainstTemplate(row(), body(t("order_id"), t("username")))).not.toThrow(); });
  it("rejects a missing name", () => { fails(row(), body(t("username")), /not matched for BODY: expected \[username, order_id\]; got \[username\]/); });
  it("rejects an unknown name", () => { fails(row(), body(t("username"), t("other")), /not matched for BODY/); });
  it("rejects a duplicate name", () => { fails(row(), body(t("username"), t("username")), /not matched for BODY/); });
  it("rejects a parameter without parameter_name", () => {
    fails(row(), body(t("username"), { type: "text", text: "x" }), /\(no parameter_name\)/);
  });
  it("rejects when no components are sent at all", () => { fails(row(), [], /not matched for BODY.*got \[\]/); });
  it("rejects non-text body parameters", () => { fails(row(), body({ type: "media", media: "https://x/a.png" }), /not matched for BODY/); });
  it("treats a non-numeric placeholder as named even when parameterFormat is null", () => {
    expect(() => validateAgainstTemplate(row({ parameterFormat: null }), body(t("username"), t("order_id")))).not.toThrow();
  });
});

describe("validateAgainstTemplate: positional", () => {
  const pos = row({ parameterFormat: "POSITIONAL", components: [{ type: "BODY", text: "Hi {{1}} {{2}}" }] });
  it("accepts the right count", () => { expect(() => validateAgainstTemplate(pos, body({ type: "text", text: "a" }, { type: "text", text: "b" }))).not.toThrow(); });
  it("rejects the wrong count", () => { fails(pos, body({ type: "text", text: "a" }), /expected 2 text parameter\(s\); got 1/); });
  it("rejects parameter_name on a positional template", () => { fails(pos, body(t("a"), t("b")), /remove parameter_name/); });
  it("accepts a template with no variables and no components", () => {
    expect(() => validateAgainstTemplate(row({ parameterFormat: "POSITIONAL", components: [{ type: "BODY", text: "Hello" }] }), [])).not.toThrow();
  });
});

describe("validateAgainstTemplate: header", () => {
  const img = row({ parameterFormat: "POSITIONAL", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hello" }] });
  const media = { type: "media", media: "https://x/a.png" };
  it("requires exactly one media parameter for an IMAGE header", () => {
    fails(img, [], /HEADER: expected exactly one media parameter for a IMAGE header/);
    fails(img, [{ type: "header", parameters: [media, media] }] as PlivoTemplateComponent[], /HEADER/);
    expect(() => validateAgainstTemplate(img, [{ type: "header", parameters: [media] }] as PlivoTemplateComponent[])).not.toThrow();
  });
  it("rejects header parameters when the template has no header", () => {
    fails(row({ components: [{ type: "BODY", text: "Hello" }], parameterFormat: "POSITIONAL" }), [{ type: "header", parameters: [media] }] as PlivoTemplateComponent[], /template has no header/);
  });
  it("checks TEXT header variables like the body", () => {
    const txt = row({ components: [{ type: "HEADER", format: "TEXT", text: "Hi {{name}}" }, { type: "BODY", text: "Hello" }] });
    fails(txt, [], /not matched for HEADER/);
    expect(() => validateAgainstTemplate(txt, [{ type: "header", parameters: [t("name")] }] as PlivoTemplateComponent[])).not.toThrow();
  });
  it("does not validate button components (unchanged behavior)", () => {
    expect(() => validateAgainstTemplate(row({ parameterFormat: "POSITIONAL", components: [{ type: "BODY", text: "Hello" }] }),
      [{ type: "button", sub_type: "url", index: 3, parameters: [{ type: "text", text: "z" }] }] as PlivoTemplateComponent[])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/template-validation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `template-validation.ts`**

```ts
import { SendValidationError, type PlivoTemplateComponent } from "./send-mapping.js";

export interface TemplateRow {
  name: string;
  language: string;
  status: string;
  components: unknown;
  parameterFormat: string | null;
}

type StoredComp = { type?: string; format?: string; text?: string };
type Params = NonNullable<PlivoTemplateComponent["parameters"]>;

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Unique placeholder keys ("1" or "username") in order of first appearance. */
export function placeholders(text: string | undefined): string[] {
  const out: string[] = [];
  for (const m of (text ?? "").matchAll(PLACEHOLDER)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

/** Picks the one approved template for name+language from every row of that name in the org; specific 400 messages otherwise. */
export function resolveTemplate(rows: TemplateRow[], name: string, language: string): TemplateRow {
  if (rows.length === 0) throw new SendValidationError(`Template "${name}" not found`);
  const sameLang = rows.filter((r) => r.language === language);
  if (sameLang.length === 0) {
    const langs = [...new Set(rows.map((r) => r.language))].sort().join(", ");
    throw new SendValidationError(`Template "${name}" has no language "${language}"; available: ${langs}`);
  }
  const approved = sameLang.filter((r) => r.status === "approved");
  if (approved.length === 0) throw new SendValidationError(`Template "${name}" (${language}) is not approved (status: ${sameLang[0]!.status})`);
  if (approved.length > 1) throw new SendValidationError("Template name and language match more than one template");
  return approved[0]!;
}

const notMatched = (part: string, detail: string): never => {
  throw new SendValidationError(`template parameters not matched for ${part}: ${detail}`);
};

function checkTextPart(part: "BODY" | "HEADER", text: string | undefined, named: boolean, sent: Params): void {
  const expected = placeholders(text);
  if (sent.some((p) => p.type !== "text")) notMatched(part, "only text parameters are allowed here");
  if (named) {
    const got = sent.map((p) => p.parameter_name ?? "");
    const ok = got.length === expected.length && got.every((n) => n !== "") && new Set(got).size === got.length && expected.every((n) => got.includes(n));
    if (!ok) notMatched(part, `expected [${expected.join(", ")}]; got [${got.map((n) => n || "(no parameter_name)").join(", ")}]`);
    return;
  }
  if (sent.some((p) => p.parameter_name !== undefined)) notMatched(part, "this template uses positional parameters, remove parameter_name");
  if (sent.length !== expected.length) notMatched(part, `expected ${expected.length} text parameter(s); got ${sent.length}`);
}

/** Compares BODY and HEADER parameters with the stored template. Button parameters are not checked here. */
export function validateAgainstTemplate(row: TemplateRow, components: PlivoTemplateComponent[]): void {
  const stored = (Array.isArray(row.components) ? row.components : []) as StoredComp[];
  const find = (t: string) => stored.find((c) => c.type?.toUpperCase() === t);
  const sentOf = (t: string): Params => components.filter((c) => c.type.toLowerCase() === t).flatMap((c) => c.parameters ?? []);
  const isNamed = (text?: string) => row.parameterFormat?.toUpperCase() === "NAMED" || placeholders(text).some((p) => !/^\d+$/.test(p));

  const body = find("BODY");
  checkTextPart("BODY", body?.text, isNamed(body?.text), sentOf("body"));

  const header = find("HEADER");
  const sentHeader = sentOf("header");
  const format = header?.format?.toUpperCase();
  if (!header) {
    if (sentHeader.length > 0) notMatched("HEADER", "template has no header");
  } else if (format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT") {
    if (sentHeader.length !== 1 || sentHeader[0]!.type !== "media") notMatched("HEADER", `expected exactly one media parameter for a ${format} header`);
  } else if (format === "TEXT" || format === undefined) {
    checkTextPart("HEADER", header.text, isNamed(header.text), sentHeader);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/api && pnpm vitest run src/lib/public-api/template-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/public-api/template-validation.ts apps/api/src/lib/public-api/template-validation.test.ts
git commit -m "feat(api): validate template parameters against the stored template"
```

---

### Task 4: Wire the validation into the send route

**Files:**
- Modify: `apps/api/src/routes/public-api/messages.ts:1-12,101-112`
- Test: `apps/api/src/routes/public-api/messages.test.ts:111-122`

**Interfaces:**
- Consumes: `resolveTemplate`, `validateAgainstTemplate` (Task 3).

- [ ] **Step 1: Write the failing route tests.** Replace the existing test at `messages.test.ts:111-122` with:

```ts
  it("template: org-scoped lookup by name, picks the approved row of the exact language; specific 400s otherwise", async () => {
    const tpl = { name: "welcome", language: "en_US", status: "approved", parameterFormat: "POSITIONAL",
      components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hi {{1}}" }] };
    const comps = [
      { type: "header", parameters: [{ type: "media", media: "https://x/a.png" }] },
      { type: "body", parameters: [{ type: "text", text: "Ann" }] },
    ];
    mockPrisma.template.findMany.mockResolvedValue([tpl]);
    const ok = await post(app, { ...body, text: undefined, template: { name: "welcome", language: "en_US", components: comps } });
    expect(ok.statusCode).toBe(202);
    expect(mockPrisma.template.findMany.mock.calls[0]![0].where).toEqual({ organizationId: "org-1", name: "welcome" });
    expect(sendAdd.mock.calls[0]![1].content).toMatchObject({ kind: "template", name: "welcome", language: "en_US" });

    mockPrisma.template.findMany.mockResolvedValue([]);
    const nf = await post(app, { ...body, text: undefined, template: { name: "nope", language: "en" } });
    expect(nf.statusCode).toBe(400);
    expect(nf.json().error).toMatch(/not found/);

    mockPrisma.template.findMany.mockResolvedValue([tpl]);
    const lang = await post(app, { ...body, text: undefined, template: { name: "welcome", language: "en" } });
    expect(lang.json().error).toMatch(/available: en_US/);

    mockPrisma.template.findMany.mockResolvedValue([{ ...tpl, status: "pending" }]);
    expect((await post(app, { ...body, text: undefined, template: { name: "welcome", language: "en_US" } })).json().error).toMatch(/not approved \(status: pending\)/);

    mockPrisma.template.findMany.mockResolvedValue([tpl, tpl]);
    expect((await post(app, { ...body, text: undefined, template: { name: "welcome", language: "en_US" } })).statusCode).toBe(400);
  });

  it("template: 400 'template parameters not matched' for wrong count or names, and nothing is written", async () => {
    mockPrisma.template.findMany.mockResolvedValue([{ name: "kyc", language: "en", status: "approved", parameterFormat: "NAMED",
      components: [{ type: "BODY", text: "Hi {{username}}, by {{order_id}}" }] }]);
    sendAdd.mockClear(); mockPrisma.message.create.mockClear();
    const res = await post(app, { ...body, text: undefined, template: { name: "kyc", language: "en",
      components: [{ type: "body", parameters: [{ type: "text", parameter_name: "username", text: "Alex" }] }] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("template parameters not matched for BODY: expected [username, order_id]; got [username]");
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(sendAdd).not.toHaveBeenCalled();

    const ok = await post(app, { ...body, text: undefined, template: { name: "kyc", language: "en",
      components: [{ type: "body", parameters: [
        { type: "text", parameter_name: "order_id", text: "WB-1001" }, { type: "text", parameter_name: "username", text: "Alex" }] }] } });
    expect(ok.statusCode).toBe(202);
    expect(sendAdd.mock.calls[0]![1].content.components[0].parameters).toEqual([
      { type: "text", text: "WB-1001", parameter_name: "order_id" }, { type: "text", text: "Alex", parameter_name: "username" }]);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && pnpm vitest run src/routes/public-api/messages.test.ts -t "template:"`
Expected: FAIL (old where clause, generic messages).

- [ ] **Step 3: Implement** in `messages.ts`

Add to the imports from `../../lib/public-api/...`:

```ts
import { resolveTemplate, validateAgainstTemplate } from "../../lib/public-api/template-validation.js";
```

Replace the template branch (current lines 101-112) with:

```ts
        if (c.kind === "template") {
          // Org-scoped by name only: language and status are resolved below so the 400 can say what exists.
          const rows = await fastify.prisma.template.findMany({
            where: { organizationId, name: c.name },
            select: { name: true, language: true, status: true, components: true, parameterFormat: true },
            take: 50,
          });
          const tpl = resolveTemplate(rows, c.name, c.language);
          validateAgainstTemplate(tpl, c.components);
          const stored = (tpl.components ?? []) as unknown[];
          const headerFormat = (stored as Array<{ type?: string; format?: string }>).find((s) => s.type?.toUpperCase() === "HEADER")?.format ?? null;
          content = { kind: "template", name: c.name, language: c.language, components: toMetaTemplateComponents(c.components, headerFormat) };
          templateBody = renderTemplateForInbox(c.name, stored, c.components);
        } else if (c.kind === "interactive") {
```

(Keep the rest of the `else if` chain unchanged; only the `if (c.kind === "template") { ... }` block is replaced.)

- [ ] **Step 4: Run to verify pass, then the whole public-api suite**

Run: `cd apps/api && pnpm vitest run src/routes/public-api src/lib/public-api src/workers`
Expected: PASS except the 2 known pre-existing flaky failures (segments/conversations; they are outside this folder). If `e2e.test.ts` or `index.test.ts` sends a template with a fixture that now fails validation, fix the fixture (the new rules are intended) and note it in the commit.

- [ ] **Step 5: Security check and commit**

Confirm in the diff: the only Prisma read added/changed is `template.findMany` and its `where` still contains `organizationId`. No new route, no RBAC change.

```bash
git add apps/api/src/routes/public-api/messages.ts apps/api/src/routes/public-api/messages.test.ts
git commit -m "feat(api): validate template send against stored template before queueing"
```

---

### Task 5: Docs and sample requests

**Files:**
- Modify: `docs/api/wbmsg-api-client-guide.md`, `docs/api/wbmsg-api-client-guide.html`, `docs/api/WBMSG-WhatsApp-API.postman_collection.json`
- Modify: `docs/prd-public-api-request-payload-logging.md` (remove old item 7)

- [ ] **Step 1:** In the guide's template-send section (find it with `grep -n "media_urls\|\"template\"" docs/api/wbmsg-api-client-guide.md`), add this example and the error list below it, in both the `.md` and `.html` files:

```json
{
  "src": "14155552671",
  "dst": "14155552672",
  "type": "whatsapp",
  "template": {
    "name": "order_confirmation",
    "language": "en",
    "components": [
      { "type": "body", "parameters": [
        { "type": "text", "parameter_name": "username", "text": "Alex" },
        { "type": "text", "parameter_name": "order_id", "text": "WB-1001" }
      ] }
    ]
  }
}
```

Text: "For templates with named variables (`{{username}}`) send `parameter_name` on every parameter; order does not matter. For numbered variables (`{{1}}`) omit `parameter_name`. Typical 400 errors: `template parameters not matched for BODY: expected [username, order_id]; got [username]`, `Template "x" not found`, `Template "x" has no language "en"; available: en_US`, `Template "x" (en) is not approved (status: pending)`."

- [ ] **Step 2:** Add the same named-parameter request as a new item in the Postman collection JSON, copying the shape of the existing template item.

- [ ] **Step 3:** In the PRD, delete section 5 item 7 (button parameter checks): the owner scoped validation to BODY and HEADER only.

- [ ] **Step 4: Commit**

```bash
git add docs/api docs/prd-public-api-request-payload-logging.md
git commit -m "docs: named template parameters and new validation errors"
```

(The client guide also ships as a PDF. Regenerating it is a separate step and the generation method is not recorded in the repo; ask the owner before touching it.)

---

## Self-Review

- Spec coverage: `parameter_name` pass-through (T1), preview (T1), empty text / duplicate components (T1), phone strictness, name and language format, callback method and URL length (T2), template-aware count/name matching, header media, lookup messages (T3, T4), docs (T5). Item 6 (whitespace rule) intentionally skipped by owner; item 7 (buttons) intentionally out of scope.
- Types: `TemplateRow`, `placeholders`, `resolveTemplate`, `validateAgainstTemplate` are defined in Task 3 and consumed with identical names in Task 4; `parameter_name` is defined in Task 1 and used in Tasks 3 and 4.
- Placeholders: none. The PDF regeneration is called out as an owner question, not a hidden TODO.
- Rollout: no migration and no env flag. Ships with a normal Railway deploy. Existing integrations sending wrong parameter counts will now get a 400 instead of a failed callback; this is the intended change.
