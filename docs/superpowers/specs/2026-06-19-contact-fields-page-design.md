# Design: Contact Fields Settings Page (Sub-project 1)

**Date:** 2026-06-19
**Status:** Approved (design)
**Part of:** Contact Settings feature — a 4-tab settings area modeled on Interakt's "Contact Settings".

## Context

The app needs a "Contact Settings" area with four tabs: **Lead Statuses · Fields · Basic Configuration · Account Owner Assignment Rules**. This is four largely independent subsystems, decomposed into sequential sub-projects:

1. **Sub-project 1 (this spec):** Page shell + settings tile + the **Fields** tab fully working.
2. Sub-project 2: Lead Statuses (new `LeadStatus` model).
3. Sub-project 3: Basic Configuration (depends on #2).
4. Sub-project 4: Account Owner Assignment Rules.

This spec covers **only Sub-project 1**. The other three tabs render a "Coming soon" placeholder so the full structure is visible immediately.

## Problem

- There is no Contact Settings page.
- A working Custom Fields manager exists at `/settings/custom-fields`, but it is **unreachable** — no tile on the settings landing grid links to it.
- The screenshot shows the Fields tab listing both **Default Fields** (read-only system fields) and **Custom Fields** (editable). We only render custom fields today.

## Solution

A new route `/settings/contact-fields` with a tabbed client component. Only the Fields tab has content this round; it shows two panels — read-only Default Fields and the existing editable Custom Fields manager. A "Contact Fields" tile is added to the settings grid. The old `/settings/custom-fields` route redirects into the new page so existing links keep working.

**No backend changes.** The Fields tab reuses the existing `/v1/contacts/custom-fields` API.

## Architecture

```
/settings/contact-fields
  page.tsx                    server component — auth guard + page header
  ContactFieldsClient.tsx     "use client" — tab bar + active-tab state (URL ?tab= synced)
  tabs/
    FieldsTab.tsx             Default Fields panel (left) + Custom Fields manager (right)
    defaultFields.ts          static config: the default field list + keyname formatting
    ComingSoon.tsx            placeholder for the 3 future tabs
```

### Files

| Action | Path | Responsibility |
|---|---|---|
| Create | `apps/web/app/(dashboard)/settings/contact-fields/page.tsx` | Server component; `auth.protect()`; renders header ("Contact Settings" / subtitle) + `<ContactFieldsClient/>` |
| Create | `apps/web/app/(dashboard)/settings/contact-fields/ContactFieldsClient.tsx` | Client; tab definitions array; active tab from `?tab=` query (default `fields`); renders tab bar + active tab body |
| Create | `apps/web/app/(dashboard)/settings/contact-fields/tabs/FieldsTab.tsx` | Two-column layout: `<DefaultFieldsPanel>` + the Custom Fields manager (lifted from existing page) |
| Create | `apps/web/app/(dashboard)/settings/contact-fields/tabs/defaultFields.ts` | Exports `DEFAULT_FIELDS` array + the field-type label map; pure, unit-tested |
| Create | `apps/web/app/(dashboard)/settings/contact-fields/tabs/ComingSoon.tsx` | Simple centered "Coming soon" placeholder, takes a `label` prop |
| Modify | `apps/web/app/(dashboard)/settings/page.tsx` | Add `{ href: "/settings/contact-fields", label: "Contact Fields", desc: "Default & custom contact fields" }` to the tile grid |
| Replace | `apps/web/app/(dashboard)/settings/custom-fields/page.tsx` | Replace the full client component with a server-side `redirect("/settings/contact-fields?tab=fields")` |

### Tabs

Tab config array drives the tab bar. Order matches Interakt:

| key | label | body |
|---|---|---|
| `lead-statuses` | Lead Statuses | `<ComingSoon label="Lead Statuses" />` |
| `fields` | Fields | `<FieldsTab />` (default tab) |
| `basic-config` | Basic Configuration | `<ComingSoon label="Basic Configuration" />` |
| `assignment-rules` | Account Owner Assignment Rules | `<ComingSoon label="Account Owner Assignment Rules" />` |

Active tab is synced to the URL `?tab=<key>` so deep links and the redirect target work. Unknown/missing `?tab=` falls back to `fields`.

## The Fields tab

Two-column responsive layout (`grid grid-cols-1 lg:grid-cols-5`): Default Fields panel spans 3 columns, Custom Fields panel spans 2. Stacks vertically below the `lg` breakpoint.

### Default Fields panel (read-only)

Header "DEFAULT FIELDS". A table/list with columns: **Field Label · Field Type · API Keyname (with copy button)**. Data comes from the static `DEFAULT_FIELDS` config — these mirror the Contact schema columns that are meaningful to users. The list is read-only (no add/edit/delete); these are system fields.

`DEFAULT_FIELDS` (label, keyname, type):

| Field Label | API Keyname | Type |
|---|---|---|
| Name | `name` | Text |
| First Name | `first_name` | Text |
| Last Name | `last_name` | Text |
| Phone Number | `phone_number` | Number |
| Email | `email` | Email |
| Status | `lifecycle_stage` | Selection List |
| Language | `language_code` | Text |
| Country Code | `country_code` | Text |
| Username | `username` | Text |
| Tags | `tags` | Tags |
| Notes | `notes` | Text |
| Account Owner | `assigned_user_id` | Selection List |
| WhatsApp Opted Out | `whatsapp_opt_out` | Boolean |
| Bot Disabled | `disable_bot` | Boolean |
| WA Blocked At | `wa_blocked_at` | Date |
| Phone Verified At | `phone_verified_at` | Date |
| External ID | `external_id` | Text |
| Created Date | `created_at` | Date |
| Updated Date | `updated_at` | Date |

**Deliberately excluded (confidential/internal DB fields):** `id`, `organization_id` (tenant keys), `custom_fields` (internal JSON — surfaced via the Custom Fields panel instead), `country_id` (internal FK), `wa_id` (internal WhatsApp identifier), `past_ai_summary` (internal AI data), `deleted_at` (soft-delete internal).

### Custom Fields panel (editable)

Header "CUSTOM FIELDS" + "Add Field" button. This is the existing manager from `apps/web/app/(dashboard)/settings/custom-fields/page.tsx` — the list, the active toggle, and the add/edit modal — moved verbatim into `FieldsTab.tsx` (or a colocated child component). Behavior, API calls (`/v1/contacts/custom-fields`), and React Query keys (`custom-fields-all`, `custom-fields`) are unchanged.

## Old page consolidation

`/settings/custom-fields/page.tsx` becomes a server component that calls `redirect("/settings/contact-fields?tab=fields")`. Both default and custom fields then live on one page (the Fields tab), and any existing bookmarks/links to `/settings/custom-fields` resolve there.

## Error handling

- Page is auth-guarded by `auth.protect()` (server) like other settings pages.
- Custom Fields data fetch failure shows the existing empty/error state (unchanged).
- Copy-to-clipboard for a keyname uses `navigator.clipboard` with a transient "Copied!" state (same pattern as `ProfileMenu` copy-org-id).

## Testing

- **Unit test** `defaultFields.test.ts`: assert `DEFAULT_FIELDS` contains the expected entries, that none of the excluded keys are present, and that the type-label formatting is correct. This is the only pure logic.
- **Manual smoke:** tile appears on `/settings`; clicking opens the page on the Fields tab; Default Fields list renders with copy buttons; Custom Fields add/edit/toggle still works; the other 3 tabs show "Coming soon"; `/settings/custom-fields` redirects to the Fields tab.
- Custom Fields behavior is already shipped and unchanged — no new tests for it.

## Out of scope (later sub-projects)

- Lead Statuses tab content (new `LeadStatus` model).
- Basic Configuration tab content.
- Account Owner Assignment Rules tab content.
- Any change to the Contact schema or custom-fields API.
- Making default fields editable or reorderable.
