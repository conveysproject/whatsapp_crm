export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "superAdmin" | "admin" | "manager" | "agent" | "viewer" | "whatsappAdmin";
  permissions: Record<string, string>;
  teamId: string | null;
  teamRole: "lead" | "member" | null;
  /** Session id of the wbmsg access token; null (or absent in test fixtures) for demo/impersonated contexts. */
  sid?: string | null;
  /** Set only for super-admin impersonation sessions; auth then describes the target user. */
  /**
   * For a session started by a parent-organization admin, adminId is that parent user and
   * parentOrganizationId is the parent org; both are absent/undefined for super-admin sessions.
   */
  impersonation?: { adminId: string; mode: "readonly" | "edit"; parentOrganizationId?: string };
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
    /** Set by requireAccountSession on account-level auth routes (no organization needed). */
    account?: { accountId: string; sid: string; typ: "user" | "admin" };
    /** Set by the public API Basic-auth preHandler. */
    publicApi?: { apiKeyId: string; organizationId: string; scopes: string[] };
    /** Set as soon as the public API credential row is found (before the token check); used only for usage attribution. */
    publicApiAttempt?: { apiKeyId: string; organizationId: string };
    /** One id per public API request; used in every response body. */
    apiId?: string;
    /** Serialized response body (string payloads only), captured by onSend when payload logging is on. */
    apiResponseBody?: string;
    /** Messages accepted by this request (set by POST /Message/); read by the usage recorder. */
    usageMessages?: number;
  }
  interface FastifyContextConfig {
    public?: boolean;
  }
}
