# PRD: Billing cycles start on each customer's registration day

Status: owner decision 2026-10-11 ("Each customer's billing month starts on their registration day"). Replaces the earlier rule "months follow UTC calendar months" for customer billing.

## Rules (rulings made so the work can proceed; each is easy to change)

1. **Anchor.** A customer's anchor day is the UTC day-of-month on which their organization was created (`organizations.created_at`). Cycle k runs from 00:00 UTC on the anchor day of one month up to (not including) 00:00 UTC on the anchor day of the next month.
2. **Short months.** If the anchor day does not exist in a month (anchor 29 to 31), the cycle boundary falls on that month's last day. A customer registered on 31 January has cycles starting 31 Jan, 28 Feb, 31 Mar, 30 Apr...
3. **Free allowance** (500) resets at the start of every cycle. Bands apply per cycle.
4. **Counting is unchanged.** Per-day counts (`message_usage_daily`) and the permanent billable record stay as they are; a cycle is the sum of its UTC days. No backfill or data migration.
5. **Cycle key** is the cycle's start date, `YYYY-MM-DD`. It replaces `YYYY-MM` in `billing_alert_events.month` and `billing_statements.month` (column names unchanged).
6. **Alerts** are evaluated per organization on its current cycle. One-time effect of the key change: an organization that already reached a level in the current calendar month may be alerted once more under its new cycle key.
7. **Statements** are prepared by a daily job (00:50 UTC) for every organization whose cycle ended that day, as drafts only. No charging, no issuing.
8. **Customer UI** shows the cycle dates ("14 Oct to 13 Nov"), "resets on 14 Nov" and "next invoice on 14 Nov" instead of calendar-month wording.
9. **Platform admin usage report** stays in calendar months (it compares organizations side by side and is not a bill). Its label says so.
10. **Cutover caveat.** Counts before 12 October 2026 are estimates (every sent message); a cycle that spans that date mixes both rules.

## Out of scope
Issuing and charging (needs start date and payment path), payment method cards.

## Rollback
Code only plus changed key format in two tables that hold no customer-visible issued data. Reverting the code restores calendar months; stale cycle-keyed rows are ignored.
