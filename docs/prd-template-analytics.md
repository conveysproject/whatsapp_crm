# PRD: Template analytics page (stage 1)

Status: DRAFT for owner sign-off (2026-10-10). Page: `/templates/:id/analytics` (`apps/web/app/(dashboard)/templates/[id]/analytics/page.tsx`). API: `GET /v1/templates/:id/analytics` (`apps/api/src/routes/templates.ts:169`).

## 1. Problem and evidence

1. **The numbers are wrong.** The endpoint counts `messages` where `body = template.name` (`templates.ts:180`). The dashboard send (`routes/messages.ts:362`), the template test-send (`templates.ts:551`) and the public API (`routes/public-api/messages.ts:22`) store a JSON string in `body` (`{"templateName":..., ...}`); campaigns store their own rendered text (`workers/campaign.worker.ts:198-217`). Only flow messages store the plain name (`lib/flow-runner.ts:238`). Production check on 2026-10-10 for template `call_milestone_monitor` (Signalz): the page counts 0 messages, the real figure is 1 read + 2 failed. There is no column linking a message to its template.
2. **The funnel is not a funnel.** Counts are the current status only, so a read message is no longer counted as sent or delivered; bars are each status's share of that sum (`page.tsx:20-57`). The API computes `readPercentage` and the page ignores it. Statuses `sending`, `expired`, `aborted` (`MessageStatus` enum) are not shown at all.
3. **Errors look like data.** A 404/500 body has no `data`, so the page shows zeros with no message or retry. No empty state, no tests.
4. **Nothing to act on.** No template header (status, quality), no date range or trend, no failure reasons even though `messages.delivery_error` now stores Meta's code/title.
5. Access: every `/templates*` route already requires `templates_access` (section hook, `templates.ts:26-31`); org scoping is correct (`findFirst({ id, organizationId })`).

## 2. Goals / non-goals

Goals (stage 1)
- Correct per-template numbers for every send path, historical and new.
- Cumulative funnel with rates, trend over a date range, failure reasons in plain language, source breakdown, reach, template card, export, proper loading/empty/error/no-permission states, dark mode, mobile layout.

Non-goals (later stages, listed in `docs/superpowers/plans/2026-10-10-template-analytics.md` Appendix)
- Time-to-deliver/read, reply rate, quick-reply taps, send-time heatmap, alerts (need `delivered_at`/`read_at` and reply linking).
- Meta-side analytics (clicks, cost), quality-score history.

## 3. Definitions (the contract the numbers follow)

For one template and a date range (on `messages.sent_at`, UTC days):
- **In progress** = status `sending`.
- **Sent** = `sent` + `delivered` + `read` (left WBMSG and did not fail).
- **Delivered** = `delivered` + `read`.
- **Read** = `read`.
- **Failed** = `failed` + `expired` + `aborted`.
- delivery rate = delivered / sent; read rate = read / delivered; failure rate = failed / (sent + failed). Denominator 0 -> null (shown as "—").
- **Unique recipients** = distinct `conversation_id`. **Last sent** = max(`sent_at`).
- **Failure reasons**: group by `delivery_error->>'code'` with Meta's title, count, share of failed, last seen; plain-language text from the existing code mapping (`lib/public-api/meta-errors.ts`) with a generic fallback "WhatsApp could not deliver the message (code N)."
- **Source** = `api` | `dashboard` | `campaign` | `flow` | `test` | `unknown` (new nullable column; old rows are backfilled where derivable, otherwise `unknown`).

## 4. Data model (hand-authored additive SQL; local DB is drifted)

`messages` gains two nullable columns and one index:
- `template_id TEXT NULL` (no foreign key: templates can be deleted and history must stay),
- `source TEXT NULL`,
- index `messages_org_template_sent_idx` on (`organization_id`, `template_id`, `sent_at`).
Migration `20261010000000_message_template_link`. Rollback: columns and index can stay unused.

Writers set both columns at: dashboard send, template test-send, public API send, campaign worker (template campaigns), flow runner. Backfill script (dry-run by default, `--apply` needs owner confirmation, batched, never touches rows that already have `template_id`):
- JSON body with `templateName` or plain-name body (flows) -> the org's template with that name when EXACTLY ONE exists; names that exist in several languages are ambiguous (the body has no language) and stay NULL, reported in the output;
- API-sent rows (`api_message_meta` exists) -> source `api`; flow plain-name -> `flow`; others `unknown`;
- campaign rows: attributed only if `rich_content` carries the template name; otherwise left NULL and counted.
The page shows a small note when a template has unattributed history ("Older messages that cannot be matched are not included").

## 5. API contract (additive)

`GET /v1/templates/:id/analytics?range=7d|30d|90d|all` (default `30d`; anything else -> 400 `INVALID_RANGE`):
```
{ data: {
    sent, delivered, read, failed,            // legacy keys kept, now cumulative per section 3
    readPercentage,                            // legacy key kept
    inProgress, rates: { delivery, read, failure },
    reach: { uniqueRecipients, lastSentAt },
    daily: [{ day, sent, delivered, read, failed }],
    failures: [{ code, title, message, count, share, lastSeenAt }],
    sources: [{ source, count }],
    template: { name, language, category, status, qualityScore, lastEditedAt, previewText },
    range, attributionNote
} }
```
Org scoping and the `templates_access` gate are unchanged; another org's id -> 404 as today.

## 6. Security and privacy

- Every query filters by `organization_id` from `request.auth` AND `template_id` of a template looked up in the same org.
- No message bodies or phone numbers leave the API in this response (counts, codes, titles only). Preview text is the template's own body text.
- Backfill and migration touch production data: dry-run first, owner confirms `--apply`; out-of-band DDL needs `prisma migrate resolve --applied` (not expected, migration runs on deploy).

## 7. Rollout

1. Deploy (migration runs via `start.sh`); new sends are linked immediately.
2. Owner runs the backfill dry run, reviews counts, then `--apply`.
3. Page shows corrected history. Rollback: revert the web page; the API stays additive.

## 8. Acceptance criteria

- For `call_milestone_monitor` the page shows 1 read, 2 failed (after backfill) and sent/delivered/read follow section 3.
- A new send through each path (dashboard, test, API, campaign, flow) appears in analytics for its template immediately with the right source.
- Another org's template id returns 404; a role without `templates_access` gets 403 and the page says so.
- Range switch changes the numbers; denominators of 0 show "—"; API errors show an error with Retry (never zeros).
- Export downloads a CSV of the daily series and failure table matching the screen.
- Dark mode and 375 px width render without horizontal scroll.

## 9. Risks / open points

- Same template name in several languages: historical rows cannot be split (reported, left unattributed).
- `sent_at` is UTC; daily buckets are UTC days (labelled). Org timezone is a possible later improvement.
- Campaign history may stay largely unattributed if `rich_content` has no template name; the backfill report will say how many.
- Large orgs: the new index plus date-range predicate keep the query bounded; add `EXPLAIN` check in the plan.
