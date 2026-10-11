/**
 * Routes a demo session (an anonymous superAdmin scoped to the demo organization) must never reach:
 * platform administration and platform-only billing actions. Used by the auth plugin on the raw path,
 * the percent-decoded path and the matched route pattern, because the router decodes the path before matching.
 */
const PLATFORM_PREFIXES = ["/v1/admin", "/v1/super-admins"];
const PLATFORM_ROUTES = [
  /^\/v1\/billing\/manual\/[^/]+\/(approve|reject)$/,
  /^\/v1\/billing\/stripe\/setup-webhook$/,
];

export function isPlatformOnlyPath(path: string): boolean {
  const p = path.toLowerCase().replace(/\/{2,}/g, "/");
  if (PLATFORM_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`))) return true;
  return PLATFORM_ROUTES.some((re) => re.test(p));
}
