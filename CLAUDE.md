# WBMSG — rules for contributors and AI assistants

## Secrets: never hardcode, always use variables

Never write a password, token, API key or connection string with credentials directly into
code, scripts, docs, tests, commit messages or chat. Always read it from an environment
variable (or a secret manager).

- Code and scripts: `process.env["DATABASE_URL"]`, `process.env["AUTH_CODE_PEPPER"]`, etc.
  For one-off prod scripts use `process.env["DATABASE_PUBLIC_URL"] ?? process.env["DATABASE_URL"]`
  and run them with `railway run --service Postgres node <script>` so Railway injects the value.
- Fail loudly when a required variable is missing; never fall back to a literal secret.
- `.env` files stay untracked. `.env.example` holds names and placeholders only, never real values.
- Tests use obvious fakes (`"test-secret"`, `"EAAG-FAKE"`), never real credentials.
- Never print a secret: when checking config, show only the variable name or the host.
- If a secret is found in the repo: stop, tell the owner, rotate it, then replace it with a
  variable. Deleting it is not enough, because it stays in git history.
