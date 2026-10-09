# Template analytics: message link backfill

Links old outbound template messages to their template (`messages.template_id`, `messages.source`).
Script: `apps/api/scripts/backfill-message-template-link.ts`. Owner-only: run against production yourself.

## Usage

    cd apps/api
    railway run --service Postgres pnpm tsx scripts/backfill-message-template-link.ts            # dry run (default), changes nothing
    railway run --service Postgres pnpm tsx scripts/backfill-message-template-link.ts --org <orgId>
    railway run --service Postgres pnpm tsx scripts/backfill-message-template-link.ts --org <orgId> --apply

Always read the dry-run counts first. `--apply` is the only mode that writes. Safe to re-run (idempotent).

## What is linked

Only outbound `template` messages with `template_id IS NULL`, and only when the organization has exactly one template with that name.

- API-sent (has an `api_message_meta` row): `source = api`
- Flow messages (plain template name as body): `source = flow`
- Dashboard and test sends (JSON body): linked, `source` stays NULL (the two cannot be told apart)

## What is skipped, and why

- ambiguous: the name exists in several languages for that organization (we do not guess)
- unmatched: no template with that name (deleted or renamed)
- unattributed_campaign_candidates: campaign messages. Old rows store only the rendered text and header/footer/buttons, never the template name, so they cannot be attributed. New campaign sends are linked at send time.
- Rows that already have a `template_id` are never touched; `source` is only filled when still NULL.
