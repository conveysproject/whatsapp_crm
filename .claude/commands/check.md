Run a full pre-commit sanity check across the WBMSG monorepo.

Execute these commands in order and wait for each to complete:

1. `pnpm lint` — ESLint all packages
2. `pnpm type-check` — TypeScript strict check all packages

After both finish, report:
- How many ESLint errors and warnings (per package)
- How many TypeScript errors (per package)
- Final verdict: PASS (zero errors) or FAIL (list what broke)
