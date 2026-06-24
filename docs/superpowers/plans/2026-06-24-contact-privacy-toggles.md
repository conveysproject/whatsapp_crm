# Contact Privacy — Granular Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single "Hide all contact field data" toggle into two independent sub-permissions: `hide_phone_only` (phone only) and `hide_contact_fields` (phone + email). All 4 masking call sites are updated to use the new helpers. Backwards compatible — existing `hide_contact_fields` rows continue to work without a migration.

**Architecture:** New `shouldHidePhone()` helper added to `permissions.ts` (union of both keys). Existing `shouldHideContactFields()` is unchanged in semantics. Inline permission checks at 4 call sites are replaced with calls to these helpers. The permissions grid gains one new sub-permission row.

**Tech Stack:** Fastify 4, TypeScript strict, ESM `.js` imports, Vitest tests, Next.js 15 App Router

## Global Constraints

- ESM-only API — every import must use `.js` extension even for `.ts` source files.
- TypeScript strict — no `any`, no implicit returns.
- No `console.log`.
- Tests use `beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); })`.
- No data migration — existing `hide_phone_number@hide_contact_fields` rows are unchanged.
- `shouldHidePhone` is a UNION: true if EITHER `hide_phone_only` OR `hide_contact_fields` is "allow".
- `shouldHideContactFields` covers ONLY `hide_contact_fields` (email masking).
- Commits follow Conventional Commits: `feat(permissions):` / `feat(contacts):` etc.

---

## Task 1: Update `permissions.ts` — add `shouldHidePhone` helper + unit tests

**File:** `apps/api/src/lib/permissions.ts`

- [ ] Add `shouldHidePhone` export immediately before `shouldHideContactFields`. The function must return `true` if EITHER `hide_phone_number@hide_phone_only` OR `hide_phone_number@hide_contact_fields` equals `"allow"`:

```typescript
// Returns true when phone should be masked — either toggle being set triggers masking.
export function shouldHidePhone(permissions: Record<string, string>): boolean {
  return (
    permissions["hide_phone_number@hide_phone_only"] === "allow" ||
    permissions["hide_phone_number@hide_contact_fields"] === "allow"
  );
}
```

- [ ] Update the JSDoc comment on `shouldHideContactFields` to clarify it only covers email masking (phone is now handled by `shouldHidePhone`):

```typescript
// Inverted semantics: "allow" means HIDE. Covers phone + email.
// Phone masking: use shouldHidePhone() which is a union of both keys.
// Email masking: only this key triggers email masking.
export function shouldHideContactFields(permissions: Record<string, string>): boolean {
  return permissions["hide_phone_number@hide_contact_fields"] === "allow";
}
```

**Unit tests file:** `apps/api/src/lib/permissions.test.ts`

- [ ] Check if `permissions.test.ts` already exists. If it does, append; if not, create it.
- [ ] Write a `describe("shouldHidePhone")` block that covers all 4 combinations:

```typescript
import { describe, it, expect } from "vitest";
import { shouldHidePhone, shouldHideContactFields } from "./permissions.js";

describe("shouldHidePhone", () => {
  it("returns false when no privacy keys are set", () => {
    expect(shouldHidePhone({})).toBe(false);
  });

  it("returns true when hide_phone_only is allow", () => {
    expect(shouldHidePhone({ "hide_phone_number@hide_phone_only": "allow" })).toBe(true);
  });

  it("returns true when hide_contact_fields is allow", () => {
    expect(shouldHidePhone({ "hide_phone_number@hide_contact_fields": "allow" })).toBe(true);
  });

  it("returns true when both are allow (union)", () => {
    expect(
      shouldHidePhone({
        "hide_phone_number@hide_phone_only": "allow",
        "hide_phone_number@hide_contact_fields": "allow",
      })
    ).toBe(true);
  });

  it("returns false when keys are present but set to deny", () => {
    expect(
      shouldHidePhone({
        "hide_phone_number@hide_phone_only": "deny",
        "hide_phone_number@hide_contact_fields": "deny",
      })
    ).toBe(false);
  });
});

describe("shouldHideContactFields", () => {
  it("returns false when no privacy keys are set", () => {
    expect(shouldHideContactFields({})).toBe(false);
  });

  it("returns true when hide_contact_fields is allow", () => {
    expect(shouldHideContactFields({ "hide_phone_number@hide_contact_fields": "allow" })).toBe(true);
  });

  it("returns false when only hide_phone_only is allow", () => {
    expect(shouldHideContactFields({ "hide_phone_number@hide_phone_only": "allow" })).toBe(false);
  });

  it("returns false when hide_contact_fields is deny", () => {
    expect(shouldHideContactFields({ "hide_phone_number@hide_contact_fields": "deny" })).toBe(false);
  });
});
```

- [ ] Commit:

```
feat(permissions): add shouldHidePhone helper — union of hide_phone_only and hide_contact_fields
```

---

## Task 2: Update the 4 masking call sites + integration tests

### 2a. `apps/api/src/routes/contacts.ts`

**Import line (line 7):** Currently imports `maskPhone, maskEmail, canAccess, canAccessSub`. Add `shouldHidePhone, shouldHideContactFields` to the import:

- [ ] Edit the import at line 7:

```typescript
// Before
import { maskPhone, maskEmail, canAccess, canAccessSub } from "../lib/permissions.js";

// After
import { maskPhone, maskEmail, canAccess, canAccessSub, shouldHidePhone, shouldHideContactFields } from "../lib/permissions.js";
```

**GET /contacts list (around line 327):** Currently:

```typescript
const hideFields = permissions["hide_phone_number@hide_contact_fields"] === "allow";
const masked = hideFields
  ? withOwner.map((c) => ({
      ...c,
      phoneNumber: maskPhone(c.phoneNumber),
      email: c.email ? maskEmail(c.email) : c.email,
    }))
  : withOwner;
```

- [ ] Replace with:

```typescript
const hideAllFields = shouldHideContactFields(permissions);
const hidePhone = shouldHidePhone(permissions);
const masked = (hidePhone || hideAllFields)
  ? withOwner.map((c) => ({
      ...c,
      phoneNumber: hidePhone ? maskPhone(c.phoneNumber) : c.phoneNumber,
      email: hideAllFields && c.email ? maskEmail(c.email) : c.email,
    }))
  : withOwner;
```

**GET /contacts/:id (around line 355):** Currently:

```typescript
const hideFields = permissions["hide_phone_number@hide_contact_fields"] === "allow";
const data = {
  ...contact,
  phoneNumber: hideFields ? maskPhone(contact.phoneNumber) : contact.phoneNumber,
  email: hideFields && contact.email ? maskEmail(contact.email) : contact.email,
  groupIds: contact.groupContacts.map((g) => g.contactGroupId),
  assignedUser,
};
```

- [ ] Replace with:

```typescript
const hideAllFields = shouldHideContactFields(permissions);
const hidePhone = shouldHidePhone(permissions);
const data = {
  ...contact,
  phoneNumber: hidePhone ? maskPhone(contact.phoneNumber) : contact.phoneNumber,
  email: hideAllFields && contact.email ? maskEmail(contact.email) : contact.email,
  groupIds: contact.groupContacts.map((g) => g.contactGroupId),
  assignedUser,
};
```

### 2b. `apps/api/src/routes/conversations.ts`

**Import line (line 6):** Currently imports `canAccess, maskPhone`. Add `shouldHidePhone`:

- [ ] Edit the import at line 6:

```typescript
// Before
import { canAccess, maskPhone } from "../lib/permissions.js";

// After
import { canAccess, maskPhone, shouldHidePhone } from "../lib/permissions.js";
```

**GET /conversations list (around line 45):** Currently:

```typescript
const hideFields = permissions["hide_phone_number@hide_contact_fields"] === "allow";
const data = conversations.map((c) => ({
  ...c,
  contact: hideFields && c.contact ? { ...c.contact, phoneNumber: maskPhone(c.contact.phoneNumber) } : c.contact,
  ...
}));
```

- [ ] Replace with:

```typescript
const hidePhone = shouldHidePhone(permissions);
const data = conversations.map((c) => ({
  ...c,
  contact: hidePhone && c.contact ? { ...c.contact, phoneNumber: maskPhone(c.contact.phoneNumber) } : c.contact,
  serviceWindowActive: c.lastInboundAt != null && now - c.lastInboundAt.getTime() < 86_400_000,
  lastMessage: c.messages?.[0] ?? null,
  messages: undefined,
}));
```

**GET /conversations/search (around line 87):** Currently:

```typescript
const hideFields = permissions["hide_phone_number@hide_contact_fields"] === "allow";
const data = conversations.map((c) => ({
  ...c,
  contact: hideFields && c.contact ? { ...c.contact, phoneNumber: maskPhone(c.contact.phoneNumber) } : c.contact,
  ...
}));
```

- [ ] Replace with:

```typescript
const hidePhone = shouldHidePhone(permissions);
const data = conversations.map((c) => ({
  ...c,
  contact: hidePhone && c.contact ? { ...c.contact, phoneNumber: maskPhone(c.contact.phoneNumber) } : c.contact,
  serviceWindowActive: c.lastInboundAt != null && now - c.lastInboundAt.getTime() < 86_400_000,
  lastMessage: c.messages?.[0] ?? null,
  messages: undefined,
}));
```

### 2c. `apps/api/src/routes/campaigns.ts`

**Import line (line 6):** Currently imports `maskPhone, maskEmail, canAccess, canAccessSub`. Add both helpers:

- [ ] Edit the import at line 6:

```typescript
// Before
import { maskPhone, maskEmail, canAccess, canAccessSub } from "../lib/permissions.js";

// After
import { maskPhone, maskEmail, canAccess, canAccessSub, shouldHidePhone, shouldHideContactFields } from "../lib/permissions.js";
```

**CSV export (around line 514):** Currently:

```typescript
const hideFields = permissions["hide_phone_number@hide_contact_fields"] === "allow";

const header = "Contact Name,Phone Number,Email,Status,Sent At,Error\n";
const rows = recipients.map((r) => {
  const resolved = r.contact ?? byPhone.get(r.phoneNumber) ?? null;
  const name = (resolved ? [resolved.firstName, resolved.lastName].filter(Boolean).join(" ") : r.fullName) || "";
  const rawPhone = resolved?.phoneNumber ?? r.phoneNumber;
  const phone = hideFields ? maskPhone(rawPhone) : rawPhone;
  const email = hideFields ? maskEmail(resolved?.email ?? "") : (resolved?.email ?? "");
  ...
});
```

- [ ] Replace with:

```typescript
const hidePhone = shouldHidePhone(permissions);
const hideEmail = shouldHideContactFields(permissions);

const header = "Contact Name,Phone Number,Email,Status,Sent At,Error\n";
const rows = recipients.map((r) => {
  const resolved = r.contact ?? byPhone.get(r.phoneNumber) ?? null;
  const name = (resolved ? [resolved.firstName, resolved.lastName].filter(Boolean).join(" ") : r.fullName) || "";
  const rawPhone = resolved?.phoneNumber ?? r.phoneNumber;
  const phone = hidePhone ? maskPhone(rawPhone) : rawPhone;
  const email = hideEmail ? maskEmail(resolved?.email ?? "") : (resolved?.email ?? "");
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [escape(name), escape(`="${phone}"`), escape(email), r.status, r.sentAt?.toISOString() ?? "", escape(r.errorMessage ?? "")].join(",");
});
```

### 2d. Integration tests for `contacts.test.ts`

The existing `contacts.test.ts` uses a `buildApp()` helper that uses a fixed `mockAuth` with `role: "admin"`. For privacy tests, we need a variant with a non-admin role and specific permissions so masking is not bypassed.

**Note:** `shouldHidePhone` and `shouldHideContactFields` do NOT call `canAccess` internally — they check `permissions` map directly. Masking applies to all roles including admin (it is a data visibility rule, not an access gate). The inline check was never gated on role. Confirm this by re-reading the existing masking block — it reads `permissions[...]` directly, not via `canAccess`. Therefore, the test helper can keep `role: "admin"` and set permissions on the mock.

- [ ] Append the following `describe` block to `apps/api/src/routes/contacts.test.ts`:

```typescript
describe("GET /v1/contacts — Contact Data Privacy masking", () => {
  async function buildAppAs(permissions: Record<string, string>): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (request) => {
      request.auth = { userId: "user-1", organizationId: "org-1", role: "agent" as const, permissions };
    });
    const { contactsRouter } = await import("./contacts.js");
    await app.register(contactsRouter, { prefix: "/v1" });
    return app;
  }

  const contact = {
    id: "c-1",
    organizationId: "org-1",
    phoneNumber: "919000000001",
    email: "alice@example.com",
    firstName: "Alice",
    lastName: null,
    tags: [],
    assignedUserId: null,
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPrisma.contact.findMany.mockResolvedValue([contact]);
    mockPrisma.contact.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([]);
  });

  it("hides phone but NOT email when only hide_phone_only is set", async () => {
    const app = await buildAppAs({
      "hide_phone_number": "allow",
      "hide_phone_number@hide_phone_only": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const items = res.json<{ data: Array<{ phoneNumber: string; email: string }> }>().data;
    expect(items[0]?.phoneNumber).not.toBe("919000000001"); // masked
    expect(items[0]?.email).toBe("alice@example.com"); // NOT masked
    await app.close();
  });

  it("hides both phone AND email when hide_contact_fields is set", async () => {
    const app = await buildAppAs({
      "hide_phone_number": "allow",
      "hide_phone_number@hide_contact_fields": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const items = res.json<{ data: Array<{ phoneNumber: string; email: string }> }>().data;
    expect(items[0]?.phoneNumber).not.toBe("919000000001"); // masked
    expect(items[0]?.email).not.toBe("alice@example.com"); // masked
    await app.close();
  });

  it("hides both phone AND email when both toggles are set (union)", async () => {
    const app = await buildAppAs({
      "hide_phone_number": "allow",
      "hide_phone_number@hide_phone_only": "allow",
      "hide_phone_number@hide_contact_fields": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const items = res.json<{ data: Array<{ phoneNumber: string; email: string }> }>().data;
    expect(items[0]?.phoneNumber).not.toBe("919000000001"); // masked
    expect(items[0]?.email).not.toBe("alice@example.com"); // masked
    await app.close();
  });

  it("shows raw phone AND email when neither toggle is set", async () => {
    const app = await buildAppAs({});
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const items = res.json<{ data: Array<{ phoneNumber: string; email: string }> }>().data;
    expect(items[0]?.phoneNumber).toBe("919000000001");
    expect(items[0]?.email).toBe("alice@example.com");
    await app.close();
  });
});
```

### 2e. Integration tests for `conversations.test.ts`

- [ ] Append the following `describe` block to `apps/api/src/routes/conversations.test.ts`:

```typescript
describe("GET /v1/conversations — phone masking via privacy toggles", () => {
  async function buildAppAs(permissions: Record<string, string>): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = {
        userId: "u-1",
        organizationId: "org-1",
        role: "agent" as const,
        permissions: { inbox_access: "allow", ...permissions },
      };
    });
    const { conversationsRouter } = await import("./conversations.js");
    await app.register(conversationsRouter, { prefix: "/v1" });
    return app;
  }

  const convWithContact = {
    id: "conv-1",
    organizationId: "org-1",
    status: "open",
    lastMessageAt: null,
    lastInboundAt: null,
    messages: [],
    contact: { id: "c-1", firstName: "Alice", lastName: null, phoneNumber: "919000000001", tags: [] },
  };

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("masks phone when hide_phone_only is set", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([convWithContact]);
    const app = await buildAppAs({
      "hide_phone_number": "allow",
      "hide_phone_number@hide_phone_only": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ contact: { phoneNumber: string } }> }>();
    expect(body.data[0]?.contact?.phoneNumber).not.toBe("919000000001");
    await app.close();
  });

  it("masks phone when hide_contact_fields is set (email not in payload)", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([convWithContact]);
    const app = await buildAppAs({
      "hide_phone_number": "allow",
      "hide_phone_number@hide_contact_fields": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ contact: { phoneNumber: string } }> }>();
    expect(body.data[0]?.contact?.phoneNumber).not.toBe("919000000001");
    await app.close();
  });

  it("does not mask phone when no privacy toggles are set", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([convWithContact]);
    const app = await buildAppAs({});
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ contact: { phoneNumber: string } }> }>();
    expect(body.data[0]?.contact?.phoneNumber).toBe("919000000001");
    await app.close();
  });
});
```

- [ ] Commit:

```
feat(contacts,conversations,campaigns): use shouldHidePhone + shouldHideContactFields at all 4 masking sites
```

---

## Task 3: Update permissions grid — add `hide_phone_only` sub-permission

**File:** `apps/web/components/permissions-grid.tsx`

The `PERMISSION_GROUPS` constant has the `hide_phone_number` group at line 19. Its `subPermissions` array currently has one entry:

```typescript
subPermissions: [
  { key: "hide_contact_fields", label: "Hide all contact field data" },
],
```

- [ ] Replace that `subPermissions` array with two entries — `hide_phone_only` first, then `hide_contact_fields`:

```typescript
subPermissions: [
  { key: "hide_phone_only",     label: "Hide phone number only" },
  { key: "hide_contact_fields", label: "Hide all contact field data (phone + email)" },
],
```

The grid component at line 148 derives the full compound key as `` `${group.key}@${sub.key}` ``, so the stored key for the new entry will be `hide_phone_number@hide_phone_only`. This matches the key read by `shouldHidePhone` — no backend change needed.

- [ ] Commit:

```
feat(permissions-grid): add hide_phone_only sub-permission under Contact Data Privacy
```

---

## Task 4: Type-check + final verification

- [ ] Run type-check across all packages:

```bash
pnpm type-check
```

Expected: 0 errors. If errors appear, fix them before proceeding — do NOT mark this task done with a failing type check.

- [ ] Run API tests:

```bash
pnpm --filter @WBMSG/api test
```

Expected: all tests pass, including the new privacy masking tests added in Tasks 1 and 2.

- [ ] If either command required fixes, commit the fixes:

```
fix(permissions): address type-check errors from privacy toggle refactor
```

- [ ] If both commands pass with no changes needed, no extra commit is required.

---

## Self-Review Against Spec

| Spec requirement | Covered in plan |
|---|---|
| `hide_phone_only` sub-key masks phone only | Task 2 — `shouldHidePhone` union; contacts + conversations use it for phone; email unchanged |
| `hide_contact_fields` sub-key masks phone + email | Task 2 — `shouldHidePhone` union (phone) + `shouldHideContactFields` (email); all 4 sites updated |
| Both keys set → both masked (union for phone, email via `hide_contact_fields`) | Task 1 unit tests cover union; Task 2 integration tests cover "both set" scenario |
| Neither key set → no masking | Task 1 + 2 cover this explicitly |
| Backwards compat — existing `hide_contact_fields` rows still work | `shouldHideContactFields` is semantically unchanged; `shouldHidePhone` also ORs in `hide_contact_fields` |
| No data migration | Confirmed — no Prisma migration step in this plan |
| Permissions grid shows 2 toggles | Task 3 adds `hide_phone_only` row before `hide_contact_fields` |
| Default role permissions unchanged (masking is opt-in) | Not touched — `default-role-permissions.ts` is explicitly out of scope |
| "Old logic" toggle skipped | Not implemented — not in any task |
| ESM `.js` imports | All import edits preserve `.js` extension |
| TypeScript strict | No `any`, explicit return types on helpers; verified in Task 4 |
| Tests: 4 scenarios for contacts, 3 for conversations | Task 2d and 2e cover all scenarios from spec |
| `shouldHideContactFields` email-only trigger (phone not gated solely on it) | Task 1 unit test: `hide_phone_only` alone → `shouldHideContactFields` returns false |
