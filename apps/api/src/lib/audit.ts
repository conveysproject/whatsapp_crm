import type { FastifyRequest } from "fastify";
import type { PrismaClient, Prisma } from "@prisma/client";

export interface AuditParams {
  prisma: PrismaClient;
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  request?: FastifyRequest;
}

// Fire-and-forget — audit failures must never block the main request
export function writeAdminAudit(params: AuditParams): void {
  const { prisma, actorId, action, targetType, targetId, metadata, request } = params;
  setImmediate(() => {
    prisma.adminAuditLog
      .create({
        data: {
          actorId,
          action,
          targetType: targetType ?? null,
          targetId: targetId ?? null,
          metadata: (metadata ?? null) as Prisma.InputJsonValue,
          ipAddress: request?.ip ?? null,
          userAgent: request?.headers?.["user-agent"] ?? null,
        },
      })
      .catch((err: unknown) => {
        // Audit write failed — log it; never let this propagate or block
        console.error("[AUDIT WRITE FAILED]", { action, actorId, targetId, err });
      });
  });
}
