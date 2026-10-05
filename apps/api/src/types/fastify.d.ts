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
  }
  interface FastifyContextConfig {
    public?: boolean;
  }
}
