/**
 * Log-safe projection of an error: its name and a code only, never its message or the object itself.
 * Prisma validation errors print the query arguments and WaApiError messages embed Meta's raw error JSON;
 * both can carry phone numbers or message text. `code` is Meta's error code for WaApiError (its `metaCode`),
 * otherwise the error's own `code` (Prisma, Node system errors) when it is a string or number.
 */
export function safeErr(err: unknown): { name: string; code?: string | number } {
  if (typeof err !== "object" || err === null) return { name: typeof err };
  const e = err as { name?: unknown; code?: unknown; metaCode?: unknown };
  const name = typeof e.name === "string" && e.name ? e.name : "Error";
  const code = typeof e.metaCode === "number" ? e.metaCode : e.code;
  return typeof code === "string" || typeof code === "number" ? { name, code } : { name };
}
