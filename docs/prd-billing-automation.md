# PRD: Automatic billing and payment-based sending pause

Status: owner decisions 2026-10-12. Billing must run without manual steps; a customer who does not pay is stopped at the moment they try to send through Meta, is told to pay, and resumes as soon as they pay.

## Decisions (owner)
1. **Block timing:** sending is blocked 7 days after a statement's due date (the due date is 7 days after issue, so about 14 days after issue). Reminder emails at +3, +7 and +14 days after the due date continue as before.
2. **What is blocked:** every outbound WhatsApp send to Meta (campaigns, flows and bot replies, inbox replies, API sends). The account stays usable: sign-in, contacts, conversations, receiving messages, and paying.
3. **Auto-issue:** statements are issued automatically when the billing month ends (the daily job), behind a global switch in Admin (`autoIssueEnabled`, default off until the owner turns it on). Statements can still be voided by hand.
4. **Queued sends:** a send refused for non-payment fails immediately with a clear "payment required" message. Nothing is held or re-sent automatically. A campaign stops at the first refusal and its remaining recipients are marked failed.
5. **Exemptions:** the owner's own organizations (Conveys Information Technology, Pooyan's Organization) are never charged or blocked. Per customer, Admin can pause blocking until a date, or exempt the customer.
6. **Rollout:** `blockingMode` is `off` | `watch` | `enforce`, default `watch`. Watch records and reports who would be blocked and shows the warning banner, but blocks nothing. The owner switches to `enforce`.
7. **No payment link yet:** a statement without a payment link never causes a block (a customer who cannot pay cannot be blocked). The daily job keeps retrying the link.
8. **Owner alerts:** one daily summary email to info@conveys.in (issued, paid, overdue, newly blocked or would-block, statements without a link). Nothing is sent on a quiet day.

## How it works
- `lib/billing/send-guard.ts` decides a customer's standing (`ok`, `overdue`, `blocked`) from their issued statements, the owner's mode and the exemptions. Cached 60 seconds per organization; cleared when a payment arrives or Admin changes an override.
- The six send functions in `lib/whatsapp.ts` call `assertSendingAllowed(phoneNumberId)` first. It resolves the organization from the phone number. Any failure of the check lets the message through (fail open): billing problems never take messaging down.
- A refused send throws `BillingBlockedError` (HTTP 402 code `BILLING_OVERDUE`). The inbox shows the message; the campaign worker marks recipients failed; automations log it.
- A banner on every page warns the organization when a statement is overdue ("pay by <date> or sending pauses") and, once blocked, that sending is paused.
- Payment unblocks within seconds (the webhook clears the cache); a customer with several overdue statements is unblocked only when none remain overdue.

## Rollback
Set `blockingMode` to `off` (instant, no deploy) to stop all blocking and banners. Set `autoIssueEnabled` to off to stop automatic issuing.
