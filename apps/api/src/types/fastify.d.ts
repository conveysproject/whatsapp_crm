export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "superAdmin" | "admin" | "manager" | "agent" | "viewer";
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
  interface FastifyContextConfig {
    public?: boolean;
  }
}
