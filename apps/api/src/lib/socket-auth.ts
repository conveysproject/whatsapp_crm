import type { PrismaClient } from "@prisma/client";
import { verifyBearer } from "../auth/identity.js";

export interface SocketIdentity {
  userId: string;
  organizationId: string;
}

/** Verifies the session token (per AUTH_PROVIDER) sent in the Socket.IO handshake (`auth.token`). Throws "unauthorized" on any failure. */
export async function authenticateSocket(
  prisma: PrismaClient,
  token: unknown,
  verify: (authHeader: string) => Promise<{ userId: string }> = verifyBearer,
): Promise<SocketIdentity> {
  if (typeof token !== "string" || token.length === 0) throw new Error("unauthorized");
  let userId: string;
  try {
    ({ userId } = await verify(`Bearer ${token}`));
  } catch {
    throw new Error("unauthorized");
  }
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, deletedAt: null },
    select: { organizationId: true },
  });
  if (!user) throw new Error("unauthorized");
  return { userId, organizationId: user.organizationId };
}

/** A socket may only join its own org room and its own user room. */
export function canJoinRoom(identity: SocketIdentity, kind: "org" | "user", id: unknown): boolean {
  if (typeof id !== "string") return false;
  return kind === "org" ? id === identity.organizationId : id === identity.userId;
}
