# Design + Plan: Account Owner Assignment Rules — Sub-project 4a (Rules Management)

**Date:** 2026-06-20
**Status:** Approved (design); combined spec+plan (lean mode).
**Part of:** Contact Settings → Sub-project 4 (Account Owner Assignment Rules — the 4th/last tab). 4a = rules CRUD + UI (stored, not yet auto-applied). 4b = evaluation engine + triggers + workload fallback.

**Role:** Full-stack engineer.

## Decisions (from brainstorm)
- New `ContactAssignmentRule` model (NOT overloading conversation `RoutingRule`).
- Team assignment → workload-balanced team member (4b). Agent pool → active `agent`-role users (4b).
- 4a now (management), 4b next (engine).

## Scope (4a only — managing rules; engine deferred to 4b)

### Schema — `ContactAssignmentRule`
```prisma
model ContactAssignmentRule {
  id              String   @id @default(uuid())
  organizationId  String   @map("organization_id")
  name            String
  trigger         String   // "contact_created" | "trait_tag_updated"
  conditions      Json     @default("[]")  // AssignmentCondition[]
  assignType      String   @default("user") @map("assign_type") // "user" | "team"
  assignTo        String   @map("assign_to") // userId or teamId
  replacePrevious Boolean  @default(false) @map("replace_previous")
  sortOrder       Int      @default(0) @map("sort_order")
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  @@index([organizationId, sortOrder])
  @@map("contact_assignment_rules")
}
```
Migration `<ts>_contact_assignment_rules`. `AssignmentCondition` (stored JSON, evaluated in 4b): `{ kind: "field"; field: string; operator: "equals"|"isNot"|"contains"; value: string }` or `{ kind: "tags"; operator: "has"|"notHas"; value: string }`.

Fallback flag stored in `Organization.settings.contactConfig.assignmentFallbackEnabled: boolean` (toggled via existing PATCH /organizations/me).

### API
- **`apps/api/src/routes/contact-assignment-rules.ts`** (new): `GET /contact-assignment-rules` (ordered by sortOrder), `POST` (append sortOrder=max+1), `PATCH /:id`, `DELETE /:id`. Writes guarded by `canAccess(role, permissions, "manage_contacts")`; all org-scoped. Validate `assignTo` belongs to the org (a user for assignType "user"; a team for "team") → 400 if not. Register in `routes/index.ts`.
- **`apps/api/src/routes/teams.ts`** (new, minimal): `GET /teams` — list org teams `{ id, name }` (the slide-over's Team picker). Register in index.
- (Agent picker reuses existing `GET /users`.)

### Web — `AssignmentRulesTab.tsx` (replaces the `assignment-rules` ComingSoon)
- Info banner (matches screenshot: custom rules first, then fallback if enabled).
- **Custom Rules table:** columns Rule Name · Trigger · Fields · Fields Value · Assignment Type · Assignees + "Add Rule" button; empty state "No result found".
- **Fallback Rule:** a toggle row — "Auto-assign all newly created contacts to active agents via Workload Balancing if they don't match any Custom Rule" — persisted to `settings.contactConfig.assignmentFallbackEnabled` via PATCH /organizations/me.
- **Create/Edit Custom Rule slide-over** (right panel):
  - Rule Name (text).
  - **If** trigger select: "New Contact Created via WA DM" (`contact_created`) / "Trait or Tag Updated" (`trait_tag_updated`).
  - **+ Add Condition** (repeatable `And` blocks): radio Field | Tags. Field → field select (firstName, lastName, email, phoneNumber, leadStatusId, countryCode, languageCode) + operator (is/is not/contains) + value. Tags → operator (has/doesn't have) + value. Each condition deletable.
  - **Then Assign:** radio Specific Agent | Specific Team → searchable select (Agent from `GET /users`, Team from `GET /teams`).
  - **Replace Previously Assigned Account Owner** checkbox.
  - Save → POST/PATCH; "Save Changes" disabled until name + an assignee chosen.
- Wire into `ContactFieldsClient.tsx`: `active === "assignment-rules" ? <AssignmentRulesTab/> : ...`.

## Out of Scope (4b)
- The evaluation engine (apply rules on contact-created + trait/tag-updated), workload-balanced team-member/fallback selection, and the trigger hooks. 4a stores + manages rules only.

## Error Handling
- `assignTo` validated against org (user/team) → 400 INVALID_ASSIGNEE. RBAC 403 on writes. Org-scoped throughout. Empty/invalid conditions allowed (engine in 4b treats no-condition rule as always-match per trigger).

## Testing
- **contact-assignment-rules.test.ts:** GET ordered; POST append + 400 on cross-org assignee; PATCH/DELETE 404 cross-org; 403 without manage_contacts.
- **Web:** type-check + build.
- **Opus final review** (new model + multi-file route + complex slide-over).

## Success Criteria
Admins can create/edit/delete account-owner assignment rules (trigger, conditions, assign to agent/team, replace-owner) and toggle the workload-balancing fallback. Rules are stored; auto-application is 4b.
