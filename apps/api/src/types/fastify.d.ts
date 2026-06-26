export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "superAdmin" | "admin" | "manager" | "agent" | "viewer";
  permissions: Record<string, string>;
  teamId: string | null;
  teamRole: "lead" | "member" | null;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
  interface FastifyContextConfig {
    public?: boolean;
  }
}
