# Agents & Teams — Interakt Sales CRM Parity

**Date:** 2026-06-26
**Status:** Design — pending approval
**Goal:** Bring WBMSG's agent + team management to exact functional parity with Interakt's Sales CRM, using WBMSG's existing role system (option B — repurpose `manager` and `agent`, no new roles).

## Source of truth (Interakt articles)

- managing-and-creating-agents-team-on-sales-crm
- add-agents-to-sales-crm
- roles-and-permissions-in-sales-crm
- create-and-manage-team-in-sales-crm

## Role mapping

WBMSG keeps its 5 existing roles. Interakt's 3 sales roles map onto them:

| Interakt role | WBMSG role | Visibility |
|---|---|---|
| Super Admin | `superAdmin` / `admin` | All org contacts (unchanged) |
| Sales Lead | `manager` | Own + unassigned + their team members' contacts |
| Sales Agent | `agent` | Only contacts assigned to them (unless `contacts_view_all`) |
| — | `viewer` | All org contacts, read-only (unchanged) |

A `manager` who has a `teamId` acts as that team's **Lead**. An `agent` with a `teamId` is a **Member**. Multiple managers (Leads) per team are allowed. One team per user.

## Data model

One field added to `User`; a `viewAllContacts` flag and a reverse relation added to `Team`.

```prisma
model User {
  // ...existing fields
  teamId  String?  @map("team_id")
  team    Team?    @relation(fields: [teamId], references: [id], onDelete: SetNull)
}

model Team {
  // ...existing fields
  viewAllContacts  Boolean  @default(false)  @map("view_all_contacts")
  members          User[]
}
```

- One team per user (`teamId` nullable scalar — not a join table). Interakt assigns an agent to a single team.
- `onDelete: SetNull` — deleting a team clears `teamId` on all members, matching Interakt's "deleting a team removes team-based visibility."
- `viewAllContacts` — per-team Lead Controls toggle. When `true`, members of that team can view all org contacts (exact Interakt "View All Contacts" behavior, scoped per team).

Migration: `add_team_membership_and_view_all`.

## Contact visibility rules

Applied in `GET /contacts` ([apps/api/src/routes/contacts.ts](../../../apps/api/src/routes/contacts.ts)) before the Prisma query, as an additional `where` constraint. Existing org-scoping and non-sales-closure-visibility logic is preserved.

| Caller | Additional `where` filter |
|---|---|
| `superAdmin` / `admin` / `viewer` | none (all org contacts) |
| `agent` whose team has `viewAllContacts = true` | none (all org contacts) |
| `agent` (default) | `assignedUserId = self.id` |
| `manager` with a team | `OR[ assignedUserId = null, assignedUserId = self.id, assignedUserId in (team member ids) ]` |
| `manager` without a team | `OR[ assignedUserId = null, assignedUserId = self.id ]` |

"Team member ids" = all users where `teamId = manager.teamId` (managers + agents in the team). Computed with a single `user.findMany({ where: { organizationId, teamId } , select: { id } })`. The caller's own team (with its `viewAllContacts` flag) is loaded once from `request.auth` / a `user.findUnique` and reused.

The same scoping is reused by `GET /contacts/export` and `GET /contacts/export/count` via the shared `buildExportWhere` helper, so exports respect visibility too.

### Inbox parity

Interakt: an agent's inbox is limited to conversations with contacts they can see. WBMSG already has `inbox_access@assigned_chats_only`. We confirm conversation list scoping mirrors contact scoping: an `agent` without `contacts_view_all` sees only conversations whose `assignedTo = self` (existing behavior — audited, not rebuilt here). Manager team-scoping for the inbox is a follow-up if conversation `assignedTo` does not already cover it.

## Permissions

Agent "view all contacts" is **data-driven per team** (`Team.viewAllContacts`), not a role permission — this matches Interakt's per-team Lead Controls toggle. No new permission key is needed for visibility.

Changes to [apps/api/src/lib/default-role-permissions.ts](../../../apps/api/src/lib/default-role-permissions.ts):

- `manager`: add `"settings_access@settings_teams": "allow"` — Interakt's Sales Lead can add/edit/delete teams.
- `admin`: add `"settings_access@settings_teams": "allow"`.

`superAdmin` bypasses all checks (unchanged). The visibility logic reads `Team.viewAllContacts` directly in the `GET /contacts` scoping builder; only a user with `settings_access@settings_teams` can flip it via `PATCH /v1/teams/:id`.

## API

### Teams CRUD — expand [apps/api/src/routes/teams.ts](../../../apps/api/src/routes/teams.ts)

All routes org-scoped; mutations gated on `settings_access@settings_teams`.

- `GET /v1/teams` — return each team with `{ id, name, description, viewAllContacts, members: [{ id, fullName, email, role }] }`.
- `POST /v1/teams` — body `{ name, memberIds: string[], viewAllContacts? }`. Validation:
  - `name` required, non-empty, unique within org.
  - `memberIds` must include **at least one `manager`** (Lead) and **at least one `agent`** (Member).
  - All `memberIds` must belong to the org and not already be in another team (or get reassigned — see below).
  - On success: create team (with `viewAllContacts`, default `false`), set `teamId` on each member.
- `PATCH /v1/teams/:id` — body `{ name?, memberIds?, viewAllContacts? }`. Same Lead/Member validation when `memberIds` provided. `viewAllContacts` toggle is the Lead Controls switch. Members removed from the list get `teamId = null`; members added get `teamId = this team` (moved out of any prior team).
- `DELETE /v1/teams/:id` — clears `teamId` on all members (DB `SetNull`), deletes team.

### User ↔ team assignment

`PATCH /v1/users/:id` accepts `teamId` (nullable). Moving a user to a team removes them from a previous team automatically (single `teamId` scalar). Constraint: an org cannot leave a team with zero Leads or zero Members via this path — validated, returns 400 if it would orphan the team. (Simplest enforcement: team Lead/Member invariant is checked on team mutation; `PATCH /v1/users` reassignment re-validates affected teams.)

### Assignment engine — [apps/api/src/lib/assignment-engine.ts](../../../apps/api/src/lib/assignment-engine.ts)

`pickWorkloadBalancedAgent(prisma, organizationId, teamId?)`:
- When called for an `assignType = "team"` rule, pass the rule's `assignTo` (team id) as `teamId`.
- Filter candidate agents to `role = "agent", isActive = true, teamId = <team>`.
- When `teamId` is undefined (org-wide fallback), behavior is unchanged (all active agents).

This fixes the existing bug where team assignment round-robins across all org agents.

## UI

| Page | Change |
|---|---|
| [apps/web/app/(dashboard)/settings/team/page.tsx](../../../apps/web/app/(dashboard)/settings/team/page.tsx) | Redirect target changes from `/settings/members` to `/settings/teams`. |
| `/settings/teams` (new page) | List teams (name, member count, Leads). Create Team modal: name + member multi-select (each member shows their role badge; validates ≥1 manager and ≥1 agent). Edit/delete. **Lead Controls** per team: a "Members can view all contacts" toggle on each team → sets `Team.viewAllContacts`. |
| [apps/web/app/(dashboard)/settings/members/page.tsx](../../../apps/web/app/(dashboard)/settings/members/page.tsx) | Add a **Team** column to the agents table. Edit-agent flow gains a team picker. |

UI follows the existing pattern in [AssignmentRulesTab.tsx](../../../apps/web/app/(dashboard)/settings/contact-settings/tabs/AssignmentRulesTab.tsx) (slide-over + react-query mutations).

## Constraints (matching Interakt exactly)

- Every team has ≥1 Lead (`manager`) and ≥1 Member (`agent`) — enforced on create/update.
- Team name required and unique within org.
- One team per user.
- Deleting a team clears `teamId` on members and removes team-based visibility.
- Agents see only their own contacts unless their team's `viewAllContacts` is on.
- Team Leads (managers) see their team members' contacts but **not** other teams' contacts.
- Only `superAdmin` / `admin` / `manager` can manage teams (`settings_access@settings_teams`).

## Out of scope (YAGNI / deferred)

- Seat-limit enforcement on agent creation (Interakt's "5 seats" — WBMSG handles limits via plan checks elsewhere; not part of this change).
- WhatsApp-number-as-login / 2FA (Interakt-specific auth; WBMSG uses Clerk).
- Multi-team membership per user.
- Manager team-scoping for the conversation inbox beyond existing `assignedTo` behavior — follow-up once contact scoping lands.

## Testing

- Unit: visibility `where`-builder for each role × team state (incl. `viewAllContacts` on/off). Lead/Member validation on team create/update. `pickWorkloadBalancedAgent` team filtering.
- Integration: agent sees only assigned contacts; manager sees team contacts but not other teams'; admin sees all; flipping a team's `viewAllContacts` changes its agents' visibility.
- RBAC audit: every new/changed route re-checked for org scoping and `settings_access@settings_teams` gating (per project security-audit requirement).

## Security audit checklist (per-task gate)

- [ ] All team routes scope by `organizationId`.
- [ ] Team mutations gated on `settings_access@settings_teams`.
- [ ] `Team.viewAllContacts` can only be flipped by a user with `settings_access@settings_teams` (not by an agent).
- [ ] Visibility filter cannot be bypassed via export, single-contact GET, or conversation routes.
- [ ] `PATCH /v1/users/:id` cannot move a user into another org's team.
