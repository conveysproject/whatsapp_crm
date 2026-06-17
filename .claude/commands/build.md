Build all apps and packages in the WBMSG monorepo.

Execute: `turbo build`

Turborepo builds in dependency order: shared packages first, then apps.
Output artifacts:
- `apps/api/dist/` — compiled Fastify API (ESM)
- `apps/web/.next/` — Next.js build output

After the build completes, report:
- Which packages were built vs served from cache
- Any build errors (with file and line number)
- Final verdict: SUCCESS or FAIL
