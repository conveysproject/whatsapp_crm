# Design + Plan: Account Owner Assignment Rules — Sub-project 4b (Evaluation Engine)

**Date:** 2026-06-20
**Status:** Approved (design); combined spec+plan (lean mode). Completes Sub-project 4 (and the whole Contact Settings feature).

**Role:** Full-stack engineer.

## Decisions (from brainstorm)
- Triggers: `contact_created` fires in the **inbound WhatsApp worker** (WA-DM contacts); `trait_tag_updated` fires in `contacts.ts` PATCH on tag/trait change.
- Team-assign → **workload-balance across all active `agent`-role users** (no User↔Team membership exists; team scoping deferred to a follow-up).
- Agent pool = active `agent`-role users.

## Scope

### `apps/api/src/lib/assignment-engine.ts` (new)
- **`type AssignmentTrigger = "contact_created" | "trait_tag_updated"`**, `interface AssignmentCondition { kind: "field" | "tags"; field?: string; operator: string; value: string }`.
- **`evaluateConditions(contact, conditions): boolean`** (pure, unit-tested): AND of all conditions. `tags` → `has`/`notHas` against `contact.tags`. `field` → case-insensitive `equals`/`isNot`/`contains` against the contact field (firstName/lastName/email/phoneNumber/leadStatusId/countryCode/languageCode). **Empty conditions ⇒ true** (always-match per trigger).
- **`pickWorkloadBalancedAgent(prisma, organizationId): Promise<string | null>`**: active `agent`-role users; least-loaded by current `assignedUserId` contact count (groupBy); null if no agents.
- **`applyAssignmentRules(prisma, organizationId, contactId, trigger): Promise<void>`**:
  1. Load the contact (id, organizationId, assignedUserId, condition fields, tags); bail if missing/cross-org.
  2. Load active rules for `(organizationId, trigger)` ordered by `sortOrder`.
  3. First rule whose `evaluateConditions` passes = the match. If the contact already has an owner and `!rule.replacePrevious` → stop (don't reassign). Else resolve assignee: `user` → `rule.assignTo` if it's an active org user; `team` → `pickWorkloadBalancedAgent`. If resolved, set `Contact.assignedUserId`. Stop after the first matching rule.
  4. If no rule matched, `trigger === "contact_created"`, the contact has no owner, and `settings.contactConfig.assignmentFallbackEnabled` is true → assign `pickWorkloadBalancedAgent`.
- All queries org-scoped.

### Integration
- **`inbound-message.worker.ts`:** before the contact upsert, check if the contact already exists (`findUnique` by org+phone). After upsert, if it did **not** exist before (newly created), call `applyAssignmentRules(prisma, organizationId, contact.id, "contact_created")` wrapped in try/catch (never block message processing).
- **`contacts.ts` PATCH:** after the existing tag/lifecycle trigger dispatch, when the PATCH changed tags or a trait field (`request.body.tags`/`leadStatusId`/`email`/`name`/`firstName`/`lastName`/`countryId`/`languageCode` present), call `applyAssignmentRules(fastify.prisma, organizationId, contact.id, "trait_tag_updated")` (best-effort; `void ... .catch`).

## Out of Scope (follow-ups)
- User↔Team membership model + members-settings UI (then team-assign picks a real team member).
- Applying `contact_created` to API/import-created contacts (kept WA-DM-only per the screenshot).

## Error Handling
- Engine wrapped at both call sites so a failure never blocks inbound processing or the PATCH response.
- Invalid/inactive `assignTo` user → resolves to null → no assignment (no crash). No agents → null → no assignment.
- `replacePrevious` guards against overwriting an existing owner.

## Testing
- **assignment-engine.test.ts:** `evaluateConditions` — field equals/isNot/contains (case-insensitive), tags has/notHas, multi-condition AND, empty ⇒ true. (Pure logic; the DB-touching `applyAssignmentRules`/`pickWorkloadBalancedAgent` are covered by type-check + the integration being exercised; a focused mock test for applyAssignmentRules' rule-match→assign + fallback path if cheap.)
- **Web:** unchanged (4a UI already manages rules).
- **Opus final review** (assignment logic correctness, replacePrevious, fallback gating, multi-tenant, integration safety).

## Success Criteria
A new WA-DM contact (and a contact whose tags/traits change) is auto-assigned an account owner per the first matching custom rule, or via the workload-balanced agent-pool fallback when enabled and no rule matches — respecting "replace previous owner".
