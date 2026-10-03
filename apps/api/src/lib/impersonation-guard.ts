import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";

/**
 * Route classification for super-admin impersonation sessions.
 *
 * Every non-GET/HEAD/OPTIONS authenticated route MUST be classified here; the
 * test in impersonation-guard.test.ts fails when a new route is not. Anything
 * unclassified is denied at runtime (deny by default), even in edit mode.
 *
 *  - READ_LIKE_POST: POST routes that do not change tenant-visible state
 *    (AI generation, previews). Allowed in read-only mode.
 *  - BLOCKED_PREFIXES / BLOCKED_ROUTES / any DELETE: never allowed while
 *    impersonating, even in edit mode (IMPERSONATION_BLOCKED).
 *  - EDIT_ROUTES: writes allowed only in edit mode.
 *
 * Keys are "METHOD /full/route/pattern" exactly as registered.
 */

export const READ_LIKE_POST: ReadonlySet<string> = new Set([
  "POST /v1/conversations/:id/summarize",
  "POST /v1/conversations/:id/suggestions",
  "POST /v1/messages/:id/analyze",
  "POST /v1/ai/smart-replies",
  "POST /v1/ai/intent",
  "POST /v1/ai/rag-answer",
  "POST /v1/ai/creator/template/generate",
  "POST /v1/ai/creator/template/refine",
  "POST /v1/ai/creator/template/image",
  "POST /v1/ai/creator/flow/generate",
  "POST /v1/ai/creator/flow/refine",
  "POST /v1/segments/preview",
  "POST /v1/segments/:id/evaluate",
]);

/** Whole route families that are off-limits while impersonating (any method). */
export const BLOCKED_PREFIXES: readonly string[] = [
  "/v1/campaigns", // campaigns and bulk sends
  "/v1/billing", // billing and plans
  "/v1/users", // users, roles, permissions, push tokens, availability (presence)
  "/v1/roles",
  "/v1/teams",
  "/v1/invitations",
  "/v1/super-admins",
  "/v1/admin", // platform admin routes are for the real super admin only
  "/v1/whatsapp-account", // WhatsApp credentials / connection
  "/v1/webhook-endpoints", // API credentials / signing secrets
  "/v1/webhook-actions",
  "/v1/vendor-settings",
  "/v1/organizations", // org settings and branding
  "/v1/onboarding",
  "/v1/notifications", // marking notifications read is visible to the tenant
  "/v1/register",
];

/**
 * Families whose GETs are also blocked for impersonated sessions (defense in depth):
 *  - /v1/admin, /v1/super-admins: platform-only data, never tenant-facing.
 *  - /v1/vendor-settings: GET returns every VendorSetting row, including whatsapp_access_token.
 *  - /v1/webhook-actions: GET returns full rows (may include outbound auth headers/secrets).
 * GET /v1/webhook-endpoints (secret not selected) and /v1/whatsapp-account/* GETs
 * (profile data only, no tokens) were reviewed and stay readable.
 */
export const BLOCKED_GET_PREFIXES: readonly string[] = [
  "/v1/admin",
  "/v1/super-admins",
  "/v1/vendor-settings",
  "/v1/webhook-actions",
];

/**
 * Individual routes that are blocked (stealth: assignment and status are tenant-visible state
 * changes with notifications/flow triggers, so they are blocked in every mode).
 * Mark-as-read and typing are EDIT_ROUTES whose handlers are explicit no-ops while impersonating.
 */
export const BLOCKED_ROUTES: ReadonlySet<string> = new Set([
  // Automations / customer sends beyond the single-reply limit.
  "POST /v1/templates/:id/send-to-contact",
  "POST /v1/contacts/import/start", // bulk contact creation job (may fire automations)
  "PATCH /v1/flows/:id", // can activate a flow (isActive)
  "POST /v1/flows/:id/test", // runs a flow against a real contact
  "PATCH /v1/chatbots/:id", // can activate a chatbot (isActive)
  "POST /v1/chatbots/:id/activate",
  "POST /v1/conversations/:id/assign",
  "POST /v1/conversations/:id/status",
  "PATCH /v1/conversations/:id/assign",
  "POST /v1/messages/gaps/requeue",
]);

/** Writes allowed in edit mode only. */
export const EDIT_ROUTES: ReadonlySet<string> = new Set([
  // Handlers return the normal success shape WITHOUT writing or emitting while impersonating.
  "POST /v1/conversations/:id/read",
  "POST /v1/conversations/:id/typing",
  "POST /v1/conversations/:id/messages",
  "POST /v1/chatbots/:id/quick-send/:contactId",
  "POST /v1/contacts",
  "PATCH /v1/contacts/:id",
  "POST /v1/contacts/:id/block",
  "POST /v1/contacts/:id/unblock",
  "POST /v1/contacts/:id/toggle-bot",
  "PUT /v1/contacts/:id/notes",
  "PUT /v1/contacts/:id/assign",
  "POST /v1/contacts/:id/events",
  "POST /v1/contacts/bulk/assign-groups",
  "POST /v1/contacts/bulk/assign-tags",
  "PUT /v1/contacts/saved-filter",
  "POST /v1/contacts/import/upload",
  "POST /v1/contacts/import/analyze",
  "POST /v1/contacts/custom-fields",
  "PATCH /v1/contacts/custom-fields/:id",
  "POST /v1/segments",
  "PATCH /v1/segments/:id",
  "POST /v1/templates",
  "POST /v1/templates/:id/submit",
  "PATCH /v1/templates/:id",
  "POST /v1/templates/sync",
  "POST /v1/pipelines",
  "PATCH /v1/pipelines/:id",
  "POST /v1/deals",
  "PATCH /v1/deals/:id",
  "PATCH /v1/deals/:id/stage",
  "POST /v1/routing-rules",
  "PATCH /v1/routing-rules/:id",
  "POST /v1/messages/:id/transcribe",
  "POST /v1/flows",
  "POST /v1/flows/:id/duplicate",
  "POST /v1/chatbots",
  "POST /v1/canned-responses",
  "PUT /v1/canned-responses/:id",
  "POST /v1/nt-campaign-presets",
  "PUT /v1/nt-campaign-presets/:id",
  "POST /v1/contact-groups",
  "PUT /v1/contact-groups/:id",
  "POST /v1/contact-groups/:id/archive",
  "POST /v1/contact-groups/:id/unarchive",
  "POST /v1/contact-groups/:id/contacts",
  "POST /v1/contact-groups/build",
  "POST /v1/saved-filters",
  "PUT /v1/saved-filters/:id",
  "POST /v1/auto-replies",
  "PATCH /v1/auto-replies/:id",
  "POST /v1/auto-replies/:id/duplicate",
  "PATCH /v1/tags/:tag",
  "PUT /v1/conversations/:id/label",
  "PUT /v1/inbox-labels/:id",
  "POST /v1/media/upload",
  "POST /v1/info-materials",
  "PATCH /v1/info-materials/:id",
  "POST /v1/media-assets",
  "POST /v1/media-assets/upload",
  "PUT /v1/media-assets/:id",
  "POST /v1/lead-statuses",
  "PATCH /v1/lead-statuses/reorder",
  "PATCH /v1/lead-statuses/:id",
  "POST /v1/contact-assignment-rules",
  "PATCH /v1/contact-assignment-rules/:id",
  "PUT /v1/automation/business-hours",
  "PUT /v1/automation/settings/ooo",
  "PUT /v1/automation/settings/welcome",
  "PUT /v1/automation/settings/delayed",
  "PUT /v1/automation/settings/intent-matching",
]);

/** Handlers are explicit no-ops while impersonating; read-only sessions get the same 204 so the inbox does not error. */
export const SILENT_NOOP_ROUTES: ReadonlySet<string> = new Set([
  "POST /v1/conversations/:id/read",
  "POST /v1/conversations/:id/typing",
]);

export type RouteClass = "read-like" | "blocked" | "edit" | "unclassified";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function matchesPrefix(prefixes: readonly string[], pattern: string): boolean {
  return prefixes.some((p) => pattern === p || pattern.startsWith(`${p}/`));
}
function isBlockedPrefix(pattern: string): boolean {
  return matchesPrefix(BLOCKED_PREFIXES, pattern);
}

/** Classify a registered route (method + full pattern). Safe methods are "read-like". */
export function classifyRoute(method: string, pattern: string): RouteClass {
  const m = method.toUpperCase();
  if (SAFE_METHODS.has(m)) return matchesPrefix(BLOCKED_GET_PREFIXES, pattern) ? "blocked" : "read-like";
  const key = `${m} ${pattern}`;
  // Blocked wins over everything: all DELETEs, blocked families and routes.
  if (m === "DELETE" || isBlockedPrefix(pattern) || BLOCKED_ROUTES.has(key)) return "blocked";
  if (READ_LIKE_POST.has(key)) return "read-like";
  if (EDIT_ROUTES.has(key)) return "edit";
  return "unclassified";
}

const impersonationGuardPlugin: FastifyPluginAsync = async (fastify) => {
  // Registered AFTER the auth plugin so request.auth.impersonation is populated.
  fastify.addHook("preHandler", async (request, reply) => {
    const imp = request.auth?.impersonation;
    if (!imp) return;
    const pattern = request.routeOptions?.url;
    if (!pattern) return; // unmatched route: 404 handler, nothing to guard

    const cls = classifyRoute(request.method, pattern);
    if (cls === "read-like") return;
    if (cls === "unclassified") {
      request.log.warn({ method: request.method, pattern }, "impersonation: unclassified route denied");
    }
    if (cls === "blocked" || cls === "unclassified") {
      return reply.status(403).send({
        error: { code: "IMPERSONATION_BLOCKED", message: "This action is not allowed during impersonation" },
      });
    }
    // cls === "edit"
    if (imp.mode !== "edit") {
      if (SILENT_NOOP_ROUTES.has(`${request.method.toUpperCase()} ${pattern}`)) return reply.status(204).send();
      return reply.status(403).send({
        error: { code: "IMPERSONATION_READ_ONLY", message: "Impersonation session is read-only" },
      });
    }
    // Edit-mode write: platform audit is FAIL-CLOSED. The insert is awaited before the handler runs;
    // if it cannot be written the request is refused (route pattern only, never bodies/secrets).
    try {
      if (!fastify.prisma) throw new Error("prisma unavailable");
      await fastify.prisma.adminAuditLog.create({
        data: {
          actorId: imp.adminId,
          action: "impersonation.request",
          targetType: "user",
          targetId: request.auth.userId,
          metadata: { method: request.method, route: pattern, organizationId: request.auth.organizationId },
          ipAddress: request.ip ?? null,
          userAgent: request.headers["user-agent"] ?? null,
        },
      });
    } catch (err) {
      request.log.error({ err }, "impersonation: audit write failed, request refused");
      return reply.status(503).send({
        error: { code: "AUDIT_UNAVAILABLE", message: "Audit log unavailable; action refused" },
      });
    }
  });
};

export default fp(impersonationGuardPlugin);
