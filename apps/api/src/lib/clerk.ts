import { createClerkClient } from "@clerk/backend";

const clerk = createClerkClient({
  secretKey: process.env["CLERK_SECRET_KEY"] ?? "",
});

export async function verifyClerkToken(authHeader: string | undefined): Promise<{
  userId: string;
  organizationId: string;
}> {
  if (!authHeader) throw new Error("Missing Authorization header");
  if (!authHeader.startsWith("Bearer ")) throw new Error("Invalid Authorization header format");

  const token = authHeader.slice(7);
  const payload = await clerk.verifyToken(token);

  const organizationId = payload.org_id;
  if (!organizationId) throw new Error("Token has no organization scope");

  return { userId: payload.sub, organizationId };
}
