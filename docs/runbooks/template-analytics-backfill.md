# Template analytics: message link backfill and release checklist

Links old outbound template messages to their template (`messages.template_id`, `messages.source`).
Script: `apps/api/scripts/backfill-message-template-link.ts`. **Owner-only:** run it against production yourself.

## Usage

    cd apps/api
    railway run --service Postgres pnpm tsx scripts/backfill-message-template-link.ts            # dry run (default), changes nothing
    railway run --service Postgres pnpm tsx scripts/backfill-message-template-link.ts --org <orgId>
    railway run --service Postgres pnpm tsx scripts/backfill-message-template-link.ts --org <orgId> --apply

Always run the dry run first and read the counts. `--apply` is the only mode that writes.

- The dry run reads 500 rows per page, each page in its own short READ ONLY transaction (60 s timeout): it cannot write and holds no long transaction.
- `--apply` works in batches of 500 rows, one UPDATE per batch. It is NOT atomic across batches (an interruption leaves earlier batches applied), but it is idempotent: every row re-checks its organization, `direction = 'outbound'`, `content_type = 'template'`, that the template belongs to the same organization, and `template_id IS NULL`, so just run it again to finish. A second run reports `updated_rows=0`.
- Never overwrites: rows that already have a `template_id` are untouched, and `source` is only filled while NULL.
- Start with one organization (`--org`), check its analytics page, then run for all.

## What is linked

Only outbound `template` messages with `template_id IS NULL`, and only when the organization has exactly one template with that name.

- API-sent (has an `api_message_meta` row): `source = api`
- Flow messages (body is a plain template name): `source = flow`. Heuristic caveat: any outbound template row whose body is only a lowercase name (letters, digits, underscore) and has no rich content is assumed to come from a flow. The owner reviews the dry-run counts (especially the flow share) before `--apply`. A different old writer that stored a plain name would be mislabeled `flow`; the template link itself would still be correct.
- Dashboard and test sends (JSON body): linked, `source` stays NULL (the two cannot be told apart; they show as "unknown" in the sources list)

## What is skipped, and why

- `ambiguous`: the name exists in several languages for that organization (we do not guess)
- `unmatched`: no template with that name (deleted or renamed), or the body holds no template name
- `unattributed_campaign_candidates`: campaign messages. Old rows store only the rendered text and header/footer/buttons, never the template name, so they cannot be attributed. New campaign sends are linked at send time.
- Rows that already have a `template_id` are never touched.

## How to read the output

Per organization: `to_update` rows that will be linked (dry run) , `ambiguous`, `unmatched`, `unattributed_campaign_candidates`. `TOTAL` sums them. With `--apply` the last line is `updated_rows=N`, which should equal `to_update` on the first run and 0 on a re-run. Rows counted as ambiguous, unmatched or campaign remain unlinked, so the analytics page keeps showing its note "Messages sent before this feature was introduced may not be included." for that organization (the note appears whenever the organization has any unlinked outbound template message).

## RELEASE CHECKLIST

1. **Before deploy (owner):** on production run read-only `SELECT count(*) FROM messages`. The migration's `CREATE INDEX` is not concurrent and briefly blocks writes to `messages`. If the table has more than about 10M rows, create the index out-of-band (`CREATE INDEX CONCURRENTLY`) and then run `prisma migrate resolve --applied 20261010000000_message_template_link` so the deploy does not fail on it.
2. **Deploy:** push `main`. The migration runs through `start.sh` on Railway.
3. **Backfill (owner-only):** run the dry run with `railway run --service Postgres pnpm tsx scripts/backfill-message-template-link.ts`, read the per-org counts, and only after confirming them run it again with `--apply` (optionally `--org <id>` first).
4. **Verify (owner):** open `/templates/<id>/analytics` for a template with known sends (for example `call_milestone_monitor`: expect 1 read and 2 failed) and compare with the Message Log.
5. **Rollback:** the new columns and the index can stay in place unused (they are additive and nullable). To remove the feature, revert the page commit (and the route if desired). The backfill needs no undo; linked rows are correct data.
