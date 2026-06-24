# Contact Privacy — Granular Toggles Design Spec

**Date:** 2026-06-24  
**Status:** Approved for implementation  
**Reference:** Interakt "Access to Contact details" section (matched minus deprecated "old logic" toggle)

---

## Goal

Split the current single "Hide all contact field data" toggle into two independent toggles — matching Interakt's granularity. Admins can now hide only phone numbers, or hide all contact fields (phone + email), as separate controls per role.

---

## Current State

One sub-permission key: `hide_phone_number@hide_contact_fields`  
- Semantics: `"allow"` = **HIDE** (inverted)  
- When set: masks phone + email across contacts list, contact detail, conversations, and campaigns CSV export  
- 4 call sites all inline `permissions["hide_phone_number@hide_contact_fields"] === "allow"`

---

## New State — 2 toggles

| Sub-key | Label | What it hides |
|---|---|---|
| `hide_phone_number@hide_phone_only` | Hide phone number only | Phone number field in contacts, conversations, campaigns CSV |
| `hide_phone_number@hide_contact_fields` | Hide all contact field data | Phone **and** email across all same locations |

**Interakt toggle skipped:** "Hide Contact's Phone number (old logic)" — explicitly labelled deprecated in Interakt's own UI; not implemented.

**Backwards compatibility:** `hide_contact_fields` key is unchanged — existing org configs that already have it set continue to work without a data migration.

---

## Masking Logic Change

New helper in `apps/api/src/lib/permissions.ts`:

```typescript
// Replaces inline `permissions["hide_phone_number@hide_contact_fields"] === "allow"`
export function shouldHidePhone(permissions: Record<string, string>): boolean {
  return (
    permissions["hide_phone_number@hide_phone_only"] === "allow" ||
    permissions["hide_phone_number@hide_contact_fields"] === "allow"
  );
}

export function shouldHideContactFields(permissions: Record<string, string>): boolean {
  return permissions["hide_phone_number@hide_contact_fields"] === "allow";
}
```

### Call site changes

| File | Current | New |
|---|---|---|
| `contacts.ts` GET list | `hideFields` → mask phone + email | `hidePhone` (phone only) + `hideAllFields` (phone + email) |
| `contacts.ts` GET /:id | same | same |
| `conversations.ts` GET + search | `hideFields` → mask phone | `shouldHidePhone()` → mask phone |
| `campaigns.ts` CSV export | `hideFields` → mask phone + email | `shouldHidePhone()` for phone, `shouldHideContactFields()` for email |

#### contacts.ts GET list (and /:id) — new pattern:
```typescript
const hideAllFields = shouldHideContactFields(permissions);
const hidePhone = shouldHidePhone(permissions); // true if either toggle set

const masked = (hidePhone || hideAllFields)
  ? contacts.map((c) => ({
      ...c,
      phoneNumber: hidePhone ? maskPhone(c.phoneNumber) : c.phoneNumber,
      email: hideAllFields && c.email ? maskEmail(c.email) : c.email,
    }))
  : contacts;
```

#### conversations.ts (phone only, email not in conversation list):
```typescript
const hidePhone = shouldHidePhone(permissions);
contact: hidePhone && c.contact
  ? { ...c.contact, phoneNumber: maskPhone(c.contact.phoneNumber) }
  : c.contact
```

#### campaigns.ts CSV export:
```typescript
const hidePhone = shouldHidePhone(permissions);
const hideEmail = shouldHideContactFields(permissions);
const phone = hidePhone ? maskPhone(rawPhone) : rawPhone;
const email = hideEmail ? maskEmail(resolved?.email ?? "") : (resolved?.email ?? "");
```

---

## Permissions Grid Update

`apps/web/components/permissions-grid.tsx` — replace 1 sub with 2:

```ts
// Before
{ key: "hide_contact_fields", label: "Hide all contact field data" }

// After
{ key: "hide_phone_only",     label: "Hide phone number only" },
{ key: "hide_contact_fields", label: "Hide all contact field data (phone + email)" },
```

---

## Default Role Permissions

No defaults change — masking is opt-in. Neither toggle is set for any role by default (same as today).

---

## Frontend

Roles settings page (`apps/web/app/(dashboard)/settings/roles/page.tsx`) renders the permissions grid. No additional UI changes needed — the grid auto-renders the new sub-permission row.

---

## Migration

No data migration needed. Existing `hide_phone_number@hide_contact_fields` rows in `vendor_settings` continue to work unchanged.

---

## Tests

Append to `apps/api/src/routes/contacts.test.ts`:

- `hide_phone_only` set → phone masked, email NOT masked
- `hide_contact_fields` set → phone AND email masked  
- Both set → phone AND email masked (union)
- Neither set → no masking

Append to `apps/api/src/routes/conversations.test.ts`:
- `hide_phone_only` set → phone masked in conversation contact
- `hide_contact_fields` set → phone masked (email not in payload)

---

## Non-Goals

- "Old logic" toggle (deprecated in Interakt, skipped)
- Per-field granularity beyond phone + email
