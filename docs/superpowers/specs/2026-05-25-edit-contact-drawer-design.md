# Edit Contact Drawer — Design Spec
_2026-05-25_

## Problem

The current `AddContactModal` handles both Add and Edit in a single component. This causes:
- Country `<select>` blank in edit mode (options load async after controlled `value` is set)
- Complex dual-mode `useEffect` state logic causing data not to populate
- Lifecycle stage and tags missing from edit
- No visual separation between add and edit flows

## Scope

1. Create `EditContactDrawer.tsx` — right-side slide-in panel, edit-only
2. Strip all edit-mode code from `AddContactModal.tsx` — add-only
3. Update `ContactsClient.tsx` to use each component for its purpose
4. Fix country dropdown pre-selection bug

---

## Components

### `EditContactDrawer` (`apps/web/components/contacts/EditContactDrawer.tsx`)

**Props:**
```ts
interface Props {
  open: boolean;
  contact: EditableContact | undefined; // full contact data fetched by ContactsClient
  onClose: () => void;
  onUpdated: (contact: Contact) => void;
}
```

**Layout:** Fixed right panel, 480px wide, full viewport height. Slides in with `translate-x-full → translate-x-0` (200ms ease). Semi-transparent backdrop covers rest of screen.

**Structure:**
- Header: contact initials avatar, display name, phone chip (read-only), ✕ close button
- Scrollable body split into four labelled sections:
  1. **Identity** — First Name, Last Name (2-col grid), Email, Country (select), Language (select)
  2. **Lifecycle** — Stage (select: lead/prospect/customer/loyal/churned), Tags (tag input with add/remove)
  3. **Groups & Settings** — Groups (multi-select dropdown), WhatsApp Opt Out toggle, Enable Reply Bot toggle
  4. **Custom Fields** — rendered only when org has custom fields; one field per row
- Sticky footer: Cancel | Save Changes

**Key technical decisions:**

- `key={contact?.id}` on the component (set in `ContactsClient`) — guarantees fresh mount per contact, so `useState` initialises from props correctly
- Country and Language selects render a loading skeleton (`animate-pulse h-9 rounded-lg bg-gray-100`) until their data arrives — eliminates the blank-selected-value bug
- Tags: stored as `string[]` on the Contact model; rendered as removable chips + inline input to add new ones
- On submit: PATCH `/v1/contacts/:id` with all changed fields; `groupIds` always sent (replaces all groups); phone number is displayed but not editable
- Success: calls `onUpdated`, parent closes drawer and shows toast
- Error: displayed inline below the footer CTA

**Animation:**
```
open=false  → transform: translateX(100%)
open=true   → transform: translateX(0)
transition: transform 200ms ease
```
Backdrop: `opacity-0 → opacity-100`, same duration.

---

### `AddContactModal` (stripped)

Remove: all `editContact` prop, `onUpdated` prop, `isEdit` branching, edit-mode useEffect. The component becomes add-only. Interface simplified:

```ts
interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (contact: Contact) => void;
}
```

Fields: First Name, Last Name, Phone (required), Email, Country, Language, Groups, Opt Out toggle, Bot toggle, Custom Fields.

---

### `ContactsClient` changes

- State: `editContact: EditableContact | undefined` (unchanged), `showEditDrawer: boolean` (renamed from `showModal` for edit path)
- `showModal` — only for add
- Edit button click → fetch contact → `setEditContact(data)` + `setShowEditDrawer(true)`
- Add button click → `setShowModal(true)`
- Render both: `<AddContactModal>` and `<EditContactDrawer key={editContact?.id}>`

---

## Data Flow

```
User clicks Edit
  → ContactsClient fetches GET /v1/contacts/:id
  → setEditContact(data) + setShowEditDrawer(true)
  → EditContactDrawer mounts fresh (key=contactId)
  → useState initialises from contact prop
  → Countries/groups/customFields fetch (useQuery, staleTime)
  → User edits fields
  → Submit → PATCH /v1/contacts/:id
  → onUpdated(contact) → ContactsClient updates table row + toast
```

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/components/contacts/EditContactDrawer.tsx` | New file |
| `apps/web/components/contacts/AddContactModal.tsx` | Remove edit-mode code |
| `apps/web/components/contacts/ContactsClient.tsx` | Wire up drawer, remove edit from modal |

No API changes needed — PATCH `/v1/contacts/:id` already accepts all fields including `lifecycleStage` and `tags`.

---

## Out of Scope

- Notes editing (contact detail page)
- Label assignment (contact detail page)
- Bulk edit
