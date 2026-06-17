Run a Prisma database migration for the WBMSG API.

$ARGUMENTS

If a migration name was passed as $ARGUMENTS, use it directly.
If no name was passed, ask: "What should this migration be named? (snake_case, e.g. add_contact_tags)"

Then execute in order:
1. `npx prisma migrate dev --name <migration_name>` — creates and applies the migration
2. `npx prisma generate` — regenerates the Prisma client

Report:
- The migration file path created (e.g. `apps/api/prisma/migrations/20260617123456_<name>/migration.sql`)
- Whether the client was regenerated successfully
- Any errors encountered
