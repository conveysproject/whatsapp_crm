# Agents & Teams — Interakt Sales CRM Parity

**Date:** 2026-06-26
**Status:** Design — pending approval
**Goal:** Bring WBMSG's agent + team management to **100% functional parity** with Interakt's Sales CRM, reusing WBMSG's existing global roles (option B) and adding a per-team **Lead/Member** hierarchy that matches Interakt's Create Team panel.

**Onboarding divergence (deliberate):** Interakt creates agents directly, with the admin typing the agent's name + WhatsApp number (the number feeds its OTP login). WBMSG keeps the existing **Invite Agent → Clerk** flow: the admin sets email + role + team; the invitee fills their own name + mobile on the acceptance page. We capture the same data (incl. mobile, for CRM display), but identity/login stays Clerk — no WhatsApp-2FA. Same outcome, our existing auth.

## Source of truth (Interakt articles + UI screenshots)

- managing-and-creating-agents-team-on-sales-crm
- add-agents-to-sales-crm
- roles-and-permissions-in-sales-crm
- create-and-manage-team-in-sales-crm

## Two layers: global role vs team role

Interakt has a **global role** (Super Admin / Sales Lead / Sales Agent) that governs *permissions*, and a **per-team hierarchy** (Lead / Member) set with a radio toggle in the Create Team panel that governs *contact visibility within a team*. WBMSG mirrors this with two independent attributes:

| Layer | Field | Governs |
|---|---|---|
| Global role | `User.role` (`superAdmin`/`admin`/`manager`/`agent`/`viewer`) | Permissions — settings access, team management, etc. |
| Team hierarchy | `User.teamRole` (`lead`/`member`) | Contact visibility within the team |

Global role mapping to Interakt:

| Interakt global role | WBMSG `role` |
|---|---|
| Super Admin | `superAdmin` / `admin` |
| Sales Lead | `manager` |
| Sales Agent | `agent` |
| — | `viewer` (read-only, unchanged) |

When an agent is added to a team, `teamRole` **defaults** from global role (`manager`→`lead`, `agent`→`member`) but is **overridable** via the per-row Lead/Member radio — exactly like Interakt. A global `agent` can be made a team `lead`; a global `manager` can be a `member`.

## Data model

`User` gains `teamId` + `teamRole`; `Team` gains `viewAllContacts` + the reverse relation.

```prisma
enum TeamRole {
  lead
  member
}

model User {
  // ...existing fields
  teamId    String?    @map("team_id")
  teamRole  TeamRole?  @map("team_role")   // null when not in a team
  team      Team?      @relation(fields: [teamId], references: [id], onDelete: SetNull)
}

model Team {
  // ...existing fields
  viewAllContacts  Boolean  @default(false)  @map("view_all_contacts")
  members          User[]
}
```

- One team per user (`teamId` nullable scalar — not a join table). Interakt assigns an agent to a single team.
- `teamRole` is meaningful only when `teamId` is set; cleared to `null` when the user leaves a team.
- `onDelete: SetNull` clears `teamId` on all members when a team is deleted (and `teamRole` is cleared in the same delete handler), matching Interakt's "deleting a team removes team-based visibility."
- `viewAllContacts` — per-team Lead Controls toggle. When `true`, every member of that team can view all org contacts (exact Interakt "View All Contacts" behavior, scoped per team).

Migration: `add_team_membership_and_view_all`.

## Contact visibility rules

Applied in `GET /contacts` ([apps/api/src/routes/contacts.ts](../../../apps/api/src/routes/contacts.ts)) before the Prisma query, as an additional `where` constraint. Existing org-scoping and non-sales-closure-visibility logic is preserved. Evaluated in precedence order — first match wins:

| # | Caller | Additional `where` filter |
|---|---|---|
| 1 | `superAdmin` / `admin` / `viewer` | none (all org contacts) |
| 2 | any user whose team has `viewAllContacts = true` | none (all org contacts) |
| 3 | `teamRole = lead` | `OR[ assignedUserId = null, assignedUserId = self.id, assignedUserId in (team member ids) ]` |
| 4 | global `manager` with no team | `OR[ assignedUserId = null, assignedUserId = self.id ]` |
| 5 | everyone else (`agent`, `teamRole = member`, unteamed agent) | `assignedUserId = self.id` |

"Team member ids" = all users where `teamId = self.teamId` (the whole team, leads + members). Computed with a single `user.findMany({ where: { organizationId, teamId }, select: { id } })`. The caller's own `{ teamId, teamRole, team.viewAllContacts }` is loaded once (via `request.auth` enrichment or a `user.findUnique`) and reused.

This is implemented as a pure `buildVisibilityWhere(auth, teamMemberIds, "assignedUserId")` helper (the same helper the inbox uses, parameterised on the assignee column) so it can be unit-tested in isolation and reused by every contact-reading route.

The same scoping is reused by `GET /contacts/export`, `GET /contacts/export/count` (via the shared `buildExportWhere` helper) and `GET /contacts/:id`, so exports and single-contact reads respect visibility too.

### Inbox parity (in scope — full)

Interakt: "If a Sales Agent has limited contact visibility, their Inbox will also be limited to only those contacts." The inbox visibility rules are the **same precedence list** as contacts, applied to the conversation list (`GET /conversations`) keyed on `Conversation.assignedTo` instead of `Contact.assignedUserId`:

| # | Caller | Conversation `where` filter |
|---|---|---|
| 1 | `superAdmin` / `admin` / `viewer` | none |
| 2 | team `viewAllContacts = true` | none |
| 3 | `teamRole = lead` | `assignedTo in (team member ids ∪ self)` |
| 4 | global `manager` with no team | `OR[ assignedTo = null, assignedTo = self.id ]` |
| 5 | everyone else | `assignedTo = self.id` |

The shared `buildVisibilityWhere(auth, teamMemberIds, fieldName)` helper produces both the contact and conversation filters from one code path (parameterised on the assignee column), so contacts and inbox can never drift. Single-conversation reads and conversation message routes enforce the same scope.

## Permissions

Contact visibility is **data-driven** (`User.teamRole` + `Team.viewAllContacts`), not a role permission — matching Interakt's per-team toggle and Lead/Member hierarchy. No new permission key is needed for visibility.

Per Interakt's Permissions Overview table, **Manage Teams = Super Admin + Sales Lead**, **Edit Roles = Super Admin only**. Changes to [apps/api/src/lib/default-role-permissions.ts](../../../apps/api/src/lib/default-role-permissions.ts):

- `manager`: add `"settings_access@settings_teams": "allow"`.
- `admin`: add `"settings_access@settings_teams": "allow"`.
- Role editing stays restricted to `superAdmin`/`admin` (existing roles page — unchanged; managers do **not** get `settings_roles`).

`superAdmin` bypasses all checks (unchanged). Only a user with `settings_access@settings_teams` can create/edit/delete teams or flip `viewAllContacts`.

## API

### Teams CRUD — expand [apps/api/src/routes/teams.ts](../../../apps/api/src/routes/teams.ts)

All routes org-scoped; mutations gated on `settings_access@settings_teams`.

- `GET /v1/teams` — return each team with `{ id, name, description, viewAllContacts, members: [{ id, fullName, email, role, teamRole }] }`. Lead names are derived from members where `teamRole = lead` (for the list's "Team Lead" column).
- `POST /v1/teams` — body `{ name, members: [{ userId, teamRole }], viewAllContacts? }`. Validation:
  - `name` required, non-empty, unique within org.
  - `members` must contain **at least one `lead`** (Interakt: "at least one agent added and at least one marked as Lead").
  - All `userId`s belong to the org; users already in another team are **moved** to this team.
  - On success: create team, set `teamId` + `teamRole` on each member.
- `PATCH /v1/teams/:id` — body `{ name?, members?, viewAllContacts? }`. Same ≥1-lead validation when `members` provided. `viewAllContacts` is the Lead Controls toggle. Members dropped from the list get `teamId = null, teamRole = null`; members added/changed get the team + their `teamRole`.
- `DELETE /v1/teams/:id` — clears `teamId` + `teamRole` on all members, deletes team.

### Agent invitation & seats (extend the existing flow — no new "Create Agent" panel)

WBMSG already onboards agents through the **Invite Agent** modal → Clerk invitation. Interakt's "Create Agent" is the same action; we keep our invite flow and only add the team fields and seat-gating:

**Split of fields** — admin sets routing data at invite time; the invitee fills their own profile at acceptance (cleaner than Interakt, where the admin types everything):

| Field | Collected at | By |
|---|---|---|
| Email, Role | Invite modal | Admin |
| Team + Lead/Member | Invite modal | Admin |
| Full name, Mobile no. | Acceptance page | Invitee |

- `POST /v1/invitations` gains optional `{ teamId?, teamRole? }`, stored on the invitation and applied to the `User` on acceptance. Email + role unchanged.
- `POST /v1/invitations/:token/accept` body gains `mobileNumber?` (and any other self-profile fields). The accept handler writes `fullName` + `mobileNumber` to the new `User`, and applies the invitation's `teamId`/`teamRole`. The acceptance page ([accept/page.tsx](../../../apps/web/app/invitations/[token]/accept/page.tsx)) already collects full name — add a mobile-number input alongside it.
- `GET /v1/invitations/seat-status` (or fold into the existing org/usage endpoint) returns `{ used, limit, canAdd }` from `checkPlanLimit(prisma, orgId, "team_members")` (resource already defined in [plan-limits.ts](../../../apps/api/src/lib/plan-limits.ts)).
- The **Invite Agent** button is disabled when `canAdd = false`, with an "Add Seats" link to billing — same seat-limit behavior Interakt describes.

### User ↔ team assignment

`PATCH /v1/users/:id` accepts `teamId` (nullable) and `teamRole`. Moving a user into a team removes them from any prior team (single `teamId` scalar) and re-validates that the prior team still has ≥1 lead — returns 400 if the move would leave a team with no Lead. Setting `teamId = null` also clears `teamRole`.

### Assignment engine — [apps/api/src/lib/assignment-engine.ts](../../../apps/api/src/lib/assignment-engine.ts)

`pickWorkloadBalancedAgent(prisma, organizationId, teamId?)`:
- For an `assignType = "team"` rule, pass the rule's `assignTo` (team id) as `teamId`.
- Filter candidates to `role = "agent", isActive = true, teamId = <team>`.
- When `teamId` is undefined (org-wide fallback), behavior is unchanged (all active agents).

Fixes the existing bug where team assignment round-robins across all org agents.

## UI

### `/settings/teams` (new page) — "Manage Teams"

- **List view** columns: `Team Name | Team Lead(s) | Team Members | actions (edit / delete)`, with a **Create Team** button top-right (mirrors Interakt's list).
- **Create / Edit slide-over** ("Create a Team"):
  - **Team Name** input.
  - **Select Team Members** — searchable dropdown of org users; each pick adds a row.
  - **Member rows table**: `Agent Name | Email | Phone No. | Lead/Member radio | remove (minus icon)`. Radio defaults from global role, overridable. Save disabled until name is set and ≥1 row is marked **Lead**.
  - **Lead Controls**: a "Members can view all contacts" toggle (sets `Team.viewAllContacts`).
- **Delete** shows a confirm dialog warning that team-based visibility is removed.

### Other pages

| Page | Change |
|---|---|
| [settings/team/page.tsx](../../../apps/web/app/(dashboard)/settings/team/page.tsx) | Redirect target changes from `/settings/members` to `/settings/teams`. |
| [settings/members/page.tsx](../../../apps/web/app/(dashboard)/settings/members/page.tsx) | Add a **Team** column to the agents table; edit-agent flow gains a team + Lead/Member picker. |
| Invite Agent modal (same page) | Existing modal gains **Assign a Team** (+ Lead/Member) fields. Invite button disabled at seat limit with an "Add Seats" link. No new panel — the current invite flow is extended. |

UI follows the existing slide-over + react-query pattern in [AssignmentRulesTab.tsx](../../../apps/web/app/(dashboard)/settings/contact-settings/tabs/AssignmentRulesTab.tsx).

## Constraints (matching Interakt exactly)

- Every team must have a name (unique within org), ≥1 member, and **≥1 Lead** — enforced on create/update.
- One team per user; `teamRole` set per membership via the Lead/Member radio.
- Deleting a team clears `teamId`/`teamRole` on members and removes team-based visibility.
- Members (and unteamed agents) see only their own assigned contacts unless their team's `viewAllContacts` is on.
- Team Leads see their own + their team members' contacts, but **not** other teams' contacts.
- Only `superAdmin` / `admin` / `manager` (those with `settings_access@settings_teams`) can manage teams. Editing global roles stays `superAdmin` / `admin` only.

## The one divergence (mechanism, not behavior)

- **Onboarding + login:** Interakt creates agents directly and logs them in via WhatsApp-number + OTP. WBMSG uses the existing **Invite Agent → Clerk** flow (admin sets email/role/team; invitee fills name/mobile at acceptance; seat-gated). Same data captured and same outcome — a role-assigned, team-assigned, seat-limited agent — but login stays Clerk. No WhatsApp-2FA, no new panel.

## Out of scope (YAGNI)

- Multi-team membership per user (Interakt is also one-team-per-agent).

## Testing

- Unit: `buildVisibilityWhere` for every (global role × teamRole × viewAllContacts) combination, for both `assignedUserId` (contacts) and `assignedTo` (conversations) columns. ≥1-Lead validation on team create/update and on user reassignment. `pickWorkloadBalancedAgent` team filtering. `teamRole` default-from-global-role logic. Seat-status `canAdd` computation.
- Integration: member sees only assigned contacts **and** only their conversations; lead sees own + team for both contacts and inbox but not other teams'; admin sees all; flipping `viewAllContacts` flips both contact and inbox visibility; deleting a team drops visibility; Create Agent disabled at seat limit.
- RBAC audit: every new/changed route re-checked for org scoping and `settings_access@settings_teams` gating (per project security-audit requirement).

## Security audit checklist (per-task gate)

- [ ] All team routes scope by `organizationId`.
- [ ] Team mutations + `viewAllContacts` flips gated on `settings_access@settings_teams` (not flippable by an agent/member).
- [ ] Visibility filter cannot be bypassed via export, single-contact GET, or conversation routes.
- [ ] `PATCH /v1/users/:id` and `POST/PATCH /v1/teams` cannot place a user into another org's team or read cross-org users.
- [ ] `teamRole` cannot be self-elevated by an agent (only via team-management routes).
