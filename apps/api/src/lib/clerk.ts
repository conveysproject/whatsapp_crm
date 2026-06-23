import { verifyToken } from "@clerk/backend";

export async function verifyClerkToken(authHeader: string | undefined): Promise<{ userId: string }> {
  if (!authHeader) throw new Error("Missing Authorization header");
  if (!authHeader.startsWith("Bearer ")) throw new Error("Invalid Authorization header format");

  const token = authHeader.slice(7);
  if (!token) throw new Error("Empty token");

  const payload = await verifyToken(token, {
    secretKey: process.env["CLERK_SECRET_KEY"] ?? "",
  });

  return { userId: payload.sub };
}
