# Plan: automations for the 5 sales template buttons, and opt-out enforcement for campaigns

## Spec

**Context.** Since 189deb8, a tap on a template quick-reply button arrives as an interactive button reply, with body = the label. It reaches:
- Active auto-replies, matched on the label (`apps/api/src/workers/inbound-message.worker.ts:323-351`).
- `button_reply` flows whose start-node `config.buttonText` equals the label, case-insensitive (`apps/api/src/lib/trigger-dispatcher.ts:77-85`).

It does **not** start `inbound_message` or `keyword_match` flows (`inbound-message.worker.ts:395-402`). A campaign send creates the conversation (`apps/api/src/workers/campaign.worker.ts:275-280`), so a tap isn't a "new conversation" and flows run (`inbound-message.worker.ts:386`).

**Prod state (Conveys org, read-only check 2026-10-16):**
- Auto-replies: "contains demo" → demo reply, and the pricing regex → new pricing reply.
- The "Unsubscribe Handler" flow is `inbound_message` + condition "contains stop" → `opt_out`. It won't run for a button tap.
- Only one user (admin), so there's no one to assign to separately.
- Existing tag in use: `hot-lead`.

**Gap 1 (data):** 7 of the 9 button labels have no reply or action.

**Gap 2 (code, compliance):** `whatsappOptOut` is enforced only for "all contacts" campaigns (`campaign.worker.ts:83-86`). Segment campaigns (`:57-61`, which call `evaluateSegment` without `whatsappOptedOnly`) and group campaigns (`:74-79`) still send to opted-out contacts.

### Part A: button flows (prod data, Conveys org only)
One `button_reply` flow per distinct label, named `Sales button: <label>`, active. Same `FlowDefinition` shape as existing flows: `startNodeId` and `nodes[{id,type,config,next}]`, with `buttonText` on the start node's config, as `Lead Qualification` keeps its keyword (`trigger-dispatcher.ts:44-50`).

| Button | Actions |
|---|---|
| Yes, book a demo | tag `hot-lead`, tag `wants-demo` (the "demo" auto-reply already replies) |
| Send pricing | tag `asked-pricing` (the pricing auto-reply already replies) |
| Calculate my savings | tag `asked-pricing`; reply asking for their monthly message count |
| Yes, set it up | tag `hot-lead`; reply "Aparna will contact you shortly… +91 87795 06101" |
| I'm ready now | tag `hot-lead`; same reply as above |
| Not now | tag `follow-up-later`; short polite reply |
| Remind me next month | tag `follow-up-later`; reply "we'll check back next month" |
| Not interested | tag `not-interested`; **opt-out** (owner decision); reply "we won't send more offers" |
| Stop messages | **opt-out**; reply "unsubscribed, reply START to re-subscribe" (same wording as the existing Unsubscribe Handler) |

The script runs a dry run by default and is idempotent: it skips any flow name that already exists. `--apply` only after the owner confirms. Rollback: deactivate or delete the flows in Flows.

### Part B: opt-out enforcement in campaigns (code)
In `resolveTargetPhones` (`campaign.worker.ts`):
- Segment mode passes `whatsappOptedOnly = true` to `evaluateSegment`.
- Group mode filters `contact: { whatsappOptOut: false, deletedAt: null }`, matching the segment evaluator's `deletedAt: null`.

Tests in `campaign.worker.test.ts`: opted-out contacts are excluded in segment and group modes, and all-contacts mode is unchanged.

**Security:** no route or RBAC change. All writes stay scoped by `organizationId`. Part B only removes recipients.

**Rollout:** Part B ships with the next push (Railway). Part A is a data change that works today, because 189deb8 is deployed.

**Out of scope (pre-existing, reported to the owner):**
- The `Lead Qualification` keyword "interested" uses `contains`, so a typed "not interested" starts lead qualification.
- The `Unsubscribe Handler` "contains stop" opts out any typed message containing "stop".
- The "start" auto-reply replies "subscribed" but doesn't set opt-in again.

## Tasks
1. TDD: write failing tests for segment and group opt-out exclusion, implement, then run the full API suite.
2. Merge locally. Push when the owner says.
3. Write the flows script. Dry run, show the output, then apply after confirmation, and re-read the result.
