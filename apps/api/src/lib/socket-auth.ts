import type { PrismaClient } from "@prisma/client";
import { verifyBearer } from "../auth/identity.js";

export interface SocketIdentity {
  userId: string;
  organizationId: string;
  /** Session id (own-auth only); null in Clerk mode. */
  sid: string | null;
}

/** Verifies the session token (per AUTH_PROVIDER) sent in the Socket.IO handshake (`auth.token`). Throws "unauthorized" on any failure. */
export async function authenticateSocket(
  prisma: PrismaClient,
  token: unknown,
  verify: (authHeader: string) => Promise<{ userId: string; sid?: string | null }> = verifyBearer,
): Promise<SocketIdentity> {
  if (typeof token !== "string" || token.length === 0) throw new Error("unauthorized");
  let userId: string;
  let sid: string | null;
  try {
    const v = await verify(`Bearer ${token}`);
    userId = v.userId;
    sid = v.sid ?? null;
  } catch {
    throw new Error("unauthorized");
  }
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, deletedAt: null },
    select: { organizationId: true },
  });
  if (!user) throw new Error("unauthorized");
  return { userId, organizationId: user.organizationId, sid };
}

/** A socket may only join its own org room and its own user room. */
export function canJoinRoom(identity: SocketIdentity, kind: "org" | "user", id: unknown): boolean {
  if (typeof id !== "string") return false;
  return kind === "org" ? id === identity.organizationId : id === identity.userId;
}
