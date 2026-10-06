export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "superAdmin" | "admin" | "manager" | "agent" | "viewer";
  permissions: Record<string, string>;
  teamId: string | null;
  teamRole: "lead" | "member" | null;
  /** Set only for super-admin impersonation sessions; auth then describes the target user. */
  impersonation?: { adminId: string; mode: "readonly" | "edit" };
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
    /** Set by the public API Basic-auth preHandler. */
    publicApi?: { apiKeyId: string; organizationId: string };
    /** Set as soon as the public API credential row is found (before the token check); used only for usage attribution. */
    publicApiAttempt?: { apiKeyId: string; organizationId: string };
    /** Messages accepted by this request (set by POST /Message/); read by the usage recorder. */
    usageMessages?: number;
  }
  interface FastifyContextConfig {
    public?: boolean;
  }
}
